"""Auth flow tests: signup -> me -> login -> duplicate/conflict -> bad creds."""

import pytest
from fastapi.testclient import TestClient


def test_signup_login_me_logout(client: TestClient):
    r = client.post(
        "/api/auth/signup",
        json={"username": "carlsen_fan", "email": "Fan@Example.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    assert r.json()["user"]["email"] == "fan@example.com"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "carlsen_fan"

    login = client.post(
        "/api/auth/login",
        json={"identifier": "carlsen_fan", "password": "password123"},
    )
    assert login.status_code == 200

    login_email = client.post(
        "/api/auth/login",
        json={"identifier": "FAN@example.com", "password": "password123"},
    )
    assert login_email.status_code == 200

    bad = client.post(
        "/api/auth/login", json={"identifier": "carlsen_fan", "password": "wrongpass1"}
    )
    assert bad.status_code == 401

    dup = client.post(
        "/api/auth/signup",
        json={"username": "carlsen_fan", "email": "other@example.com", "password": "password123"},
    )
    assert dup.status_code == 409

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
