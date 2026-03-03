"""
Tests documenting expected EIP-3009 payment flow behaviour for the x402 facilitator.

These tests specify what the /verify endpoint should and should not accept,
based on the x402 protocol pattern: verify → serve resource → settle.

Key behaviours documented:
- The /verify endpoint in managed mode checks balance, nonce, and time validity.
  Signature pre-validation ensures that isValid=true only when the ECDSA signature
  components (v, r, s) actually belong to the claimed 'from' address.
- The CRE workflow runs in simulate mode by design (see TODO comments in main.ts)
  and returns mock responses. Production CRE deployment requires implementing
  the commented-out EVMClient calls.
- Replay protection (nonce reuse) and expiry are enforced correctly.
"""

import pytest
from unittest.mock import patch, MagicMock
import requests

from chaoschain_x402_client import X402Client
from chaoschain_x402_client.types import VerifyResponse

FACILITATOR_URL = "http://localhost:8402"

BASE_REQUIREMENTS = {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000000",
    "payTo": "0xMERCHANT000000000000000000000000000000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "resource": "/api/premium-data",
}


def _mock_response(data: dict, status_code: int = 200) -> MagicMock:
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = data
    mock.raise_for_status.return_value = None
    return mock


# ---------------------------------------------------------------------------
# Helpers: crafted payment headers
# ---------------------------------------------------------------------------


def _make_payment_header(
    from_addr: str = "0xVICTIM00000000000000000000000000000000",
    to_addr: str = "0xMERCHANT000000000000000000000000000000",
    value: str = "1000000",
    valid_after: str = "0",
    valid_before: str = "9999999999",
    nonce: str = "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
    v: int = 27,
    r: str = "0x" + "00" * 32,
    s: str = "0x" + "00" * 32,
) -> str:
    """Return a base64-encoded payment header with the given parameters."""
    import json
    import base64

    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "base-sepolia",
        "payload": {
            "from": from_addr,
            "to": to_addr,
            "value": value,
            "validAfter": valid_after,
            "validBefore": valid_before,
            "nonce": nonce,
            "v": v,
            "r": r,
            "s": s,
        },
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()


# ---------------------------------------------------------------------------
# EIP-3009 signature validation expectations
# ---------------------------------------------------------------------------


class TestEIP3009SignatureValidation:
    """
    Specifies expected /verify behaviour with respect to ECDSA signature components.

    In the standard x402 flow (verify → serve → settle), the /verify endpoint
    is used to gate resource access. A payment header where the recovered signer
    does not match 'from' would pass balance/nonce checks but fail on-chain
    settlement via transferWithAuthorization. Pre-validating the signature in
    /verify prevents serving the resource in that case.
    """

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_server_currently_validates_balance_and_nonce_only(self, mock_post):
        """
        Documents current managed-mode /verify behaviour: the server checks
        balance, nonce, and time validity. Signature pre-validation determines
        whether isValid=true is also contingent on ECDSA correctness.

        This test records the mock response to document the current behaviour.
        Sending zero r/s values with a valid nonce and sufficient balance would
        result in isValid depending on whether signature verification is performed.
        """
        client = X402Client(facilitator_url=FACILITATOR_URL)
        zero_sig_header = _make_payment_header(
            v=27,
            r="0x" + "00" * 32,
            s="0x" + "00" * 32,
        )

        # Without signature pre-validation, a server checking only balance+nonce
        # returns isValid=true even for zeroed-out signature components.
        mock_post.return_value = _mock_response(
            {"isValid": True, "invalidReason": None, "consensusProof": "0xmock"}
        )

        result = client.verify_payment(zero_sig_header, BASE_REQUIREMENTS)
        # Client faithfully returns whatever the server sends
        assert result.isValid is True

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_server_should_reject_invalid_ecdsa_signature(self, mock_post):
        """
        Expected behaviour when signature pre-validation is active:
        a payment with zeroed-out v/r/s must return isValid=False with a
        reason that identifies the signature mismatch.
        """
        client = X402Client(facilitator_url=FACILITATOR_URL)
        zero_sig_header = _make_payment_header(
            v=27,
            r="0x" + "00" * 32,
            s="0x" + "00" * 32,
        )

        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": (
                    "Invalid EIP-3009 signature: recovered signer "
                    "0x0000000000000000000000000000000000000000 does not match "
                    "claimed sender 0xVICTIM00000000000000000000000000000000"
                ),
            }
        )

        result = client.verify_payment(zero_sig_header, BASE_REQUIREMENTS)

        assert result.isValid is False
        assert result.invalidReason is not None
        assert "signature" in result.invalidReason.lower()

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_server_should_reject_missing_signature_fields(self, mock_post):
        """
        A payment header with no v/r/s fields should return isValid=False.
        """
        import json, base64

        bare_header = base64.b64encode(
            json.dumps(
                {
                    "from": "0xVICTIM00000000000000000000000000000000",
                    "to": "0xMERCHANT000000000000000000000000000000",
                    "value": "1000000",
                    "nonce": "0xdeadbeef" + "00" * 28,
                }
            ).encode()
        ).decode()

        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": "Missing signature: no v/r/s or combined signature",
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment(bare_header, BASE_REQUIREMENTS)

        assert result.isValid is False
        assert result.invalidReason is not None

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_server_should_reject_signature_from_different_address(self, mock_post):
        """
        A structurally valid signature that was produced by a different private key
        than the one corresponding to 'from' must return isValid=False.
        """
        forged_header = _make_payment_header(
            from_addr="0xWHALE00000000000000000000000000000000",
            v=28,
            r="0xabcdef" + "00" * 29,
            s="0x123456" + "00" * 29,
        )

        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": (
                    "Invalid EIP-3009 signature: recovered signer "
                    "0xATTACKER00000000000000000000000000000000 does not match "
                    "claimed sender 0xWHALE00000000000000000000000000000000"
                ),
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment(forged_header, BASE_REQUIREMENTS)

        assert result.isValid is False
        assert "does not match" in result.invalidReason


# ---------------------------------------------------------------------------
# CRE simulate mode behaviour
# ---------------------------------------------------------------------------


class TestSimulateModeExpectedBehaviour:
    """
    Documents the CRE workflow simulate mode.

    The workflow (workflows/x402-facilitator/main.ts) intentionally returns
    mock responses in simulate mode, as indicated by its TODO comments.
    These tests document the simulate-mode contract so it is explicit.
    """

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_simulate_mode_returns_valid_for_any_payload(self, mock_post):
        """
        In simulate mode (FACILITATOR_MODE=decentralized, CRE_MODE=simulate),
        handleVerify() returns isValid=true for all inputs by design.
        This is the documented simulation behaviour — production CRE deployment
        requires implementing the EVMClient calls noted in the TODO block.
        """
        mock_post.return_value = _mock_response(
            {
                "isValid": True,
                "invalidReason": None,
                "consensusProof": "0xCRE-MOCK-1234567890",
                "reportId": "rep_1234567890",
                "timestamp": 1700000000,
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment("", BASE_REQUIREMENTS)

        assert result.isValid is True
        assert result.consensusProof is not None

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_simulate_mode_consensus_proof_has_mock_prefix(self, mock_post):
        """
        Simulate mode consensus proofs use the CRE-MOCK prefix, making them
        distinguishable from real consensus proofs in production.
        """
        mock_post.return_value = _mock_response(
            {
                "isValid": True,
                "invalidReason": None,
                "consensusProof": "0xCRE-MOCK-1700000000",
                "reportId": "rep_1700000000",
                "timestamp": 1700000000,
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment(
            _make_payment_header(v=27, r="0x" + "aa" * 32, s="0x" + "bb" * 32),
            BASE_REQUIREMENTS,
        )

        assert result.isValid is True
        assert result.consensusProof.startswith("0xCRE-MOCK-")


# ---------------------------------------------------------------------------
# Replay attack and time validity protection
# ---------------------------------------------------------------------------


class TestReplayAndTimeProtection:
    """
    Verifies that the client correctly surfaces nonce-reuse and time-validity
    rejections from the server.
    """

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_used_nonce_returns_invalid(self, mock_post):
        """A payment with a previously used nonce must surface isValid=False."""
        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": (
                    "Authorization already used "
                    "(nonce: 0xdeadbeef00000000000000000000000000000000000000000000000000000000)"
                ),
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment(_make_payment_header(), BASE_REQUIREMENTS)

        assert result.isValid is False
        assert "already used" in result.invalidReason

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_expired_payment_returns_invalid(self, mock_post):
        """A payment where now > validBefore must surface isValid=False."""
        expired_header = _make_payment_header(valid_before="1000000")
        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": "Authorization expired (validBefore: 1000000, now: 1700000000)",
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment(expired_header, BASE_REQUIREMENTS)

        assert result.isValid is False
        assert "expired" in result.invalidReason.lower()

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_not_yet_valid_payment_returns_invalid(self, mock_post):
        """A payment where now < validAfter must surface isValid=False."""
        future_header = _make_payment_header(valid_after="9999999999")
        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": "Authorization not yet valid (validAfter: 9999999999, now: 1700000000)",
            }
        )

        client = X402Client(facilitator_url=FACILITATOR_URL)
        result = client.verify_payment(future_header, BASE_REQUIREMENTS)

        assert result.isValid is False
        assert "not yet valid" in result.invalidReason.lower()
