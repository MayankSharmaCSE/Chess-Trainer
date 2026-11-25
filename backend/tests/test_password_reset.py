"""Forgot / reset password: one-time expiring links, no account probing,
rate limit, old sessions revoked, and the email providers."""

import re
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

import app.api.routes_auth as routes_auth
from app.core import config
from app.db.base import SessionLocal
from app.models.user import PasswordResetToken
from app.services import mailer


@pytest.fixture()
def outbox(monkeypatch):
    """Capture emails synchronously instead of sending them."""
    sent: list[dict] = []
    monkeypatch.setattr(
        routes_auth, "_send_in_background",
        lambda to, subject, text, html, token_id: sent.append(
            {"to": to, "subject": subject, "text": text, "html": html, "token_id": token_id}
        ),
    )
    return sent


def _signup(client: TestClient, username: str) -> str:
    r = client.post(
        "/api/auth/signup",
        json={"username": username, "email": f"{username}@example.com", "password": "oldpassword1"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _token_from(mail: dict) -> str:
    m = re.search(r"/reset-password\?token=([A-Za-z0-9_\-]+)", mail["text"])
    assert m, mail["text"]
    return m.group(1)


def test_full_reset_flow(client: TestClient, outbox):
    old_session = _signup(client, "resetme")
    r = client.post("/api/auth/forgot-password", json={"identifier": "RESETME@example.com"})
    assert r.status_code == 202
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "resetme@example.com"
    assert "Your username is: resetme" in mail["text"]  # also covers "forgot username"
    token = _token_from(mail)

    assert client.post("/api/auth/reset-password/check", json={"token": token}).json() == {"valid": True}
    r = client.post("/api/auth/reset-password", json={"token": token, "password": "newpassword1"})
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "resetme"

    # New password works, old one doesn't.
    assert client.post("/api/auth/login", json={"identifier": "resetme", "password": "newpassword1"}).status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "resetme", "password": "oldpassword1"}).status_code == 401
    # Sessions from before the reset are signed out.
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_session}"}).status_code == 401
    # The link is single-use.
    again = client.post("/api/auth/reset-password", json={"token": token, "password": "another123"})
    assert again.status_code == 400
    assert client.post("/api/auth/reset-password/check", json={"token": token}).json() == {"valid": False}


def test_forgot_by_username_and_same_response_for_unknown(client: TestClient, outbox):
    _signup(client, "byname")
    known = client.post("/api/auth/forgot-password", json={"identifier": "ByName"})
    unknown = client.post("/api/auth/forgot-password", json={"identifier": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()  # can't tell which accounts exist
    assert [m["to"] for m in outbox] == ["byname@example.com"]


def test_only_latest_link_works_and_rate_limit(client: TestClient, outbox):
    _signup(client, "spammy")
    for _ in range(5):
        assert client.post("/api/auth/forgot-password", json={"identifier": "spammy"}).status_code == 202
    assert len(outbox) == config.PASSWORD_RESET_MAX_PER_HOUR == 3
    first, last = _token_from(outbox[0]), _token_from(outbox[-1])
    assert client.post("/api/auth/reset-password/check", json={"token": first}).json() == {"valid": False}
    assert client.post("/api/auth/reset-password/check", json={"token": last}).json() == {"valid": True}


def test_expired_link_rejected_and_token_not_stored_in_plain(client: TestClient, outbox):
    _signup(client, "slowpoke")
    client.post("/api/auth/forgot-password", json={"identifier": "slowpoke"})
    token = _token_from(outbox[0])
    with SessionLocal() as db:
        row = db.query(PasswordResetToken).order_by(PasswordResetToken.id.desc()).first()
        assert row.token_hash != token and len(row.token_hash) == 64
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    r = client.post("/api/auth/reset-password", json={"token": token, "password": "newpassword1"})
    assert r.status_code == 400
    assert "expired" in r.json()["detail"]


def test_weak_password_rejected(client: TestClient, outbox):
    _signup(client, "weakpw")
    client.post("/api/auth/forgot-password", json={"identifier": "weakpw"})
    r = client.post("/api/auth/reset-password", json={"token": _token_from(outbox[0]), "password": "short"})
    assert r.status_code == 422


def test_brevo_provider_payload(monkeypatch):
    monkeypatch.setattr(config, "MAIL_PROVIDER", "")
    monkeypatch.setattr(config, "BREVO_API_KEY", "test-key")
    monkeypatch.setattr(config, "MAIL_FROM_EMAIL", "noreply@example.com")
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return httpx.Response(201, request=httpx.Request("POST", url), json={"messageId": "x"})

    monkeypatch.setattr(mailer.httpx, "post", fake_post)
    assert mailer.status() == {"provider": "brevo", "sends_real_email": True, "from": "noreply@example.com"}
    mailer.send_email("user@example.com", "Subj", "text", "<p>html</p>")
    assert sent["url"] == mailer.BREVO_URL
    assert sent["headers"]["api-key"] == "test-key"
    assert sent["json"]["to"] == [{"email": "user@example.com"}]
    assert sent["json"]["sender"]["email"] == "noreply@example.com"


def test_brevo_error_raises(monkeypatch):
    monkeypatch.setattr(config, "MAIL_PROVIDER", "brevo")
    monkeypatch.setattr(config, "BREVO_API_KEY", "bad")
    monkeypatch.setattr(config, "MAIL_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(
        mailer.httpx, "post",
        lambda url, **k: httpx.Response(401, request=httpx.Request("POST", url), text='{"message":"Key not found"}'),
    )
    with pytest.raises(mailer.MailError, match="401"):
        mailer.send_email("u@example.com", "s", "t", "h")


def test_console_provider_when_unconfigured(monkeypatch):
    for k in ("MAIL_PROVIDER", "BREVO_API_KEY", "SMTP_HOST"):
        monkeypatch.setattr(config, k, "")
    assert mailer.status()["provider"] == "console"
    assert mailer.status()["sends_real_email"] is False
    mailer.send_email("u@example.com", "s", "t", "h")  # logs, never raises


def test_failed_sends_do_not_use_up_the_rate_limit(client: TestClient, outbox):
    """Regression: emails the provider rejected (e.g. Brevo IP block) used to
    count toward the 3/hour limit, locking the user out after the fix."""
    _signup(client, "unlucky")
    for _ in range(3):
        client.post("/api/auth/forgot-password", json={"identifier": "unlucky"})
    assert len(outbox) == 3
    # Those sends "failed" (sent_at stays NULL) and are now past the pending grace.
    with SessionLocal() as db:
        for row in db.query(PasswordResetToken).filter(PasswordResetToken.id.in_([m["token_id"] for m in outbox])):
            row.created_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()
    client.post("/api/auth/forgot-password", json={"identifier": "unlucky"})
    assert len(outbox) == 4  # not rate-limited


def test_successful_send_marks_token_sent(client: TestClient, monkeypatch):
    _signup(client, "marksent")
    captured = {}
    monkeypatch.setattr(mailer, "send_email", lambda *a: captured.setdefault("sent", True))

    class Inline:  # run the background thread inline
        def __init__(self, target, **_):
            self.target = target

        def start(self):
            self.target()

    monkeypatch.setattr(routes_auth.threading, "Thread", Inline)
    client.post("/api/auth/forgot-password", json={"identifier": "marksent"})
    assert captured.get("sent")
    with SessionLocal() as db:
        row = db.query(PasswordResetToken).order_by(PasswordResetToken.id.desc()).first()
        assert row.sent_at is not None
