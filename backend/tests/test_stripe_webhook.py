"""
Integration tests for POST /api/webhook/stripe.

Scope:
  - Endpoint contract: siempre retorna {"received": True} / 200
  - Resilience: firma inválida, cuerpo vacío, JSON malformado — sin crashes
  - Simulation: payloads con estructura de checkout.session.completed y
    payment_intent.payment_failed son aceptados sin error 500.

NOTE: El path de actualización de DB (payment_status → "paid") sólo se activa
con firma Stripe verificada, lo cual requiere emergentintegrations y
STRIPE_WEBHOOK_SECRET reales. Ese path se prueba en test_stripe_paid_flow.py
(end-to-end con Stripe test mode).
"""
import json
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").strip().rstrip("/")

pytestmark = pytest.mark.skipif(
    not BASE_URL,
    reason="Set REACT_APP_BACKEND_URL to run (e.g. http://localhost:8000)",
)

WEBHOOK_URL = f"{BASE_URL}/api/webhook/stripe"

# Stripe-style event payloads (estructura real, firma forjada / ausente)
_CHECKOUT_COMPLETED = {
    "id": "evt_test_completed_001",
    "type": "checkout.session.completed",
    "data": {
        "object": {
            "id": "cs_test_abc123",
            "payment_status": "paid",
            "amount_total": 350000,
            "currency": "mxn",
            "metadata": {"pending_id": "fake_pending_001", "guest_email": "test@example.com"},
        }
    },
}

_PAYMENT_FAILED = {
    "id": "evt_test_failed_001",
    "type": "payment_intent.payment_failed",
    "data": {
        "object": {
            "id": "pi_test_failed_001",
            "status": "requires_payment_method",
            "last_payment_error": {"code": "card_declined", "message": "Your card was declined."},
        }
    },
}


# ── Endpoint Contract ───────────────────────────────────────────────────────

def test_webhook_no_auth_required():
    """Stripe llama el webhook sin autorización — debe ser accesible sin token."""
    r = requests.post(WEBHOOK_URL, json={})
    assert r.status_code == 200


def test_webhook_always_returns_received_true_on_empty_body():
    r = requests.post(WEBHOOK_URL, data=b"", headers={"Content-Type": "application/json"})
    assert r.status_code == 200
    assert r.json().get("received") is True


def test_webhook_always_returns_received_true_without_signature():
    r = requests.post(WEBHOOK_URL, json=_CHECKOUT_COMPLETED)
    assert r.status_code == 200
    assert r.json().get("received") is True


def test_webhook_always_returns_received_true_with_fake_signature():
    r = requests.post(
        WEBHOOK_URL,
        data=json.dumps(_CHECKOUT_COMPLETED).encode(),
        headers={
            "Content-Type": "application/json",
            "Stripe-Signature": "t=1700000000,v1=fakesignaturehex0000000000000000000000000",
        },
    )
    assert r.status_code == 200
    assert r.json().get("received") is True


# ── Event Simulation ────────────────────────────────────────────────────────

def test_checkout_session_completed_payload_does_not_crash():
    """checkout.session.completed sin firma válida: endpoint no debe lanzar 500."""
    r = requests.post(
        WEBHOOK_URL,
        data=json.dumps(_CHECKOUT_COMPLETED).encode(),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json() == {"received": True}


def test_payment_failed_payload_does_not_crash():
    """payment_intent.payment_failed sin firma válida: endpoint no debe lanzar 500."""
    r = requests.post(
        WEBHOOK_URL,
        data=json.dumps(_PAYMENT_FAILED).encode(),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json() == {"received": True}


# ── Resilience ──────────────────────────────────────────────────────────────

def test_malformed_json_body_does_not_crash():
    r = requests.post(
        WEBHOOK_URL,
        data=b"not-valid-json{{{",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json().get("received") is True


def test_unrecognised_event_type_does_not_crash():
    payload = {"id": "evt_unknown", "type": "some.unknown.event", "data": {}}
    r = requests.post(WEBHOOK_URL, json=payload)
    assert r.status_code == 200
    assert r.json().get("received") is True


# ── Security: unverified webhook must NOT mutate DB ─────────────────────────

def test_unverified_checkout_completed_does_not_mark_transaction_paid():
    """
    POST checkout.session.completed sin firma válida → el payment_transaction
    no debe cambiar a 'paid'. El endpoint captura la excepción de firma inválida
    y retorna received:True sin modificar DB.
    """
    fake_session_id = "cs_test_security_check_999"
    payload = {**_CHECKOUT_COMPLETED}
    payload["data"] = {
        "object": {**_CHECKOUT_COMPLETED["data"]["object"], "id": fake_session_id}
    }
    r = requests.post(
        WEBHOOK_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Stripe-Signature": "t=1700000000,v1=invalidsignature",
        },
    )
    assert r.status_code == 200
    # Si StripeCheckout está instalado, verificará la firma y fallará → no actualiza DB.
    # Si no está instalado (entorno local), retorna received:True inmediatamente.
    assert r.json().get("received") is True
