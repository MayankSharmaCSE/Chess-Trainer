"""Outbound email (password resets).

Providers, picked by MAIL_PROVIDER or automatically:
- brevo:   HTTPS API (works on Render's free tier, which blocks SMTP ports)
- smtp:    any SMTP server (local dev, paid hosts)
- console: nothing is sent; the message is logged (development only)
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.core import config

logger = logging.getLogger("chesslens.mail")

BREVO_URL = "https://api.brevo.com/v3/smtp/email"


class MailError(RuntimeError):
    pass


def provider() -> str:
    if config.MAIL_PROVIDER in ("brevo", "smtp", "console"):
        return config.MAIL_PROVIDER
    if config.BREVO_API_KEY:
        return "brevo"
    if config.SMTP_HOST:
        return "smtp"
    return "console"


def status() -> dict:
    """For /api/health: which provider, and whether it can actually send."""
    p = provider()
    ready = {
        "brevo": bool(config.BREVO_API_KEY and config.MAIL_FROM_EMAIL),
        "smtp": bool(config.SMTP_HOST and config.MAIL_FROM_EMAIL),
        "console": False,
    }[p]
    return {"provider": p, "sends_real_email": ready, "from": config.MAIL_FROM_EMAIL or None}


def send_email(to: str, subject: str, text: str, html: str) -> None:
    """Send one message. Raises MailError on failure."""
    p = provider()
    if p == "console":
        logger.warning(
            "EMAIL NOT SENT (MAIL_PROVIDER=console, dev only). To: %s | Subject: %s\n%s",
            to, subject, text,
        )
        return
    if not config.MAIL_FROM_EMAIL:
        raise MailError("MAIL_FROM_EMAIL is not set.")
    if p == "brevo":
        _send_brevo(to, subject, text, html)
    else:
        _send_smtp(to, subject, text, html)


def _send_brevo(to: str, subject: str, text: str, html: str) -> None:
    try:
        resp = httpx.post(
            BREVO_URL,
            headers={"api-key": config.BREVO_API_KEY, "accept": "application/json"},
            json={
                "sender": {"name": config.MAIL_FROM_NAME, "email": config.MAIL_FROM_EMAIL},
                "to": [{"email": to}],
                "subject": subject,
                "textContent": text,
                "htmlContent": html,
            },
            timeout=15,
        )
    except httpx.HTTPError as e:
        raise MailError(f"Brevo request failed: {type(e).__name__}") from e
    if resp.status_code >= 300:
        raise MailError(f"Brevo HTTP {resp.status_code}: {resp.text[:200]}")


def _send_smtp(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["From"] = f"{config.MAIL_FROM_NAME} <{config.MAIL_FROM_EMAIL}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
            if config.SMTP_STARTTLS:
                s.starttls()
            if config.SMTP_USER:
                s.login(config.SMTP_USER, config.SMTP_PASSWORD)
            s.send_message(msg)
    except (OSError, smtplib.SMTPException) as e:
        raise MailError(f"SMTP send failed: {type(e).__name__}: {e}") from e
