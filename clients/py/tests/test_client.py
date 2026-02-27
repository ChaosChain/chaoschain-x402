"""
Unit tests for the ChaosChain x402 Python client.

Tests all public methods of X402Client using mocked HTTP responses,
verifying correct request construction and response parsing.
"""

import pytest
from unittest.mock import patch, MagicMock, call
import requests

from chaoschain_x402_client import X402Client
from chaoschain_x402_client.types import (
    VerifyResponse,
    SettleResponse,
    SupportedSchemesResponse,
    ServiceInfo,
)

# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------

BASE_REQUIREMENTS = {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000000",
    "payTo": "0xMERCHANT000000000000000000000000000000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "resource": "/api/test",
}

# Minimal base64-encoded payment header (not cryptographically valid, intentional)
PAYMENT_HEADER = "eyJ4NDAyVmVyc2lvbiI6MX0="

FACILITATOR_URL = "http://localhost:8402"


def _mock_response(data: dict, status_code: int = 200) -> MagicMock:
    """Return a MagicMock that mimics a successful requests.Response."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = data
    if status_code >= 400:
        mock.raise_for_status.side_effect = requests.HTTPError(response=mock)
    else:
        mock.raise_for_status.return_value = None
    return mock


# ---------------------------------------------------------------------------
# Client initialisation
# ---------------------------------------------------------------------------


class TestX402ClientInit:
    def test_trailing_slash_stripped_from_url(self):
        client = X402Client(facilitator_url="http://localhost:8402/")
        assert client.facilitator_url == "http://localhost:8402"

    def test_double_trailing_slash_stripped(self):
        client = X402Client(facilitator_url="http://localhost:8402//")
        assert client.facilitator_url == "http://localhost:8402"

    def test_default_x402_version(self):
        client = X402Client(facilitator_url=FACILITATOR_URL)
        assert client.x402_version == 1

    def test_default_timeout(self):
        client = X402Client(facilitator_url=FACILITATOR_URL)
        assert client.timeout == 30

    def test_custom_x402_version(self):
        client = X402Client(facilitator_url=FACILITATOR_URL, x402_version=2)
        assert client.x402_version == 2

    def test_custom_timeout(self):
        client = X402Client(facilitator_url=FACILITATOR_URL, timeout=60)
        assert client.timeout == 60

    def test_content_type_header_set(self):
        client = X402Client(facilitator_url=FACILITATOR_URL)
        assert client.session.headers["Content-Type"] == "application/json"


# ---------------------------------------------------------------------------
# verify_payment
# ---------------------------------------------------------------------------


class TestVerifyPayment:
    def setup_method(self):
        self.client = X402Client(facilitator_url=FACILITATOR_URL)

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_valid_payment_returns_is_valid_true(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "isValid": True,
                "invalidReason": None,
                "consensusProof": "0xabc",
                "reportId": "rep_1",
                "timestamp": 1700000000,
            }
        )
        result = self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert isinstance(result, VerifyResponse)
        assert result.isValid is True
        assert result.invalidReason is None

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_invalid_payment_returns_reason(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "isValid": False,
                "invalidReason": "Insufficient balance",
                "consensusProof": None,
                "reportId": "rep_2",
                "timestamp": 1700000000,
            }
        )
        result = self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert result.isValid is False
        assert result.invalidReason == "Insufficient balance"

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_sends_correct_endpoint(self, mock_post):
        mock_post.return_value = _mock_response(
            {"isValid": True, "invalidReason": None}
        )
        self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        url = mock_post.call_args[0][0]
        assert url == f"{FACILITATOR_URL}/verify"

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_sends_correct_payload_structure(self, mock_post):
        mock_post.return_value = _mock_response(
            {"isValid": True, "invalidReason": None}
        )
        self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        payload = mock_post.call_args[1]["json"]
        assert payload["paymentHeader"] == PAYMENT_HEADER
        assert payload["x402Version"] == 1
        assert payload["paymentRequirements"]["scheme"] == "exact"
        assert payload["paymentRequirements"]["network"] == "base-sepolia"
        assert payload["paymentRequirements"]["maxAmountRequired"] == "1000000"

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_uses_configured_timeout(self, mock_post):
        client = X402Client(facilitator_url=FACILITATOR_URL, timeout=5)
        mock_post.return_value = _mock_response(
            {"isValid": True, "invalidReason": None}
        )
        client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert mock_post.call_args[1]["timeout"] == 5

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_timeout_raises_timeout_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout()

        with pytest.raises(TimeoutError, match="timed out after"):
            self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_connection_error_raises_runtime_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("refused")

        with pytest.raises(RuntimeError, match="Verification failed"):
            self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_http_error_raises_runtime_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.HTTPError("500 Server Error")

        with pytest.raises(RuntimeError, match="Verification failed"):
            self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

    def test_missing_required_field_raises_validation_error(self):
        from pydantic import ValidationError

        incomplete = {
            "scheme": "exact",
            # missing: network, maxAmountRequired, payTo, asset, resource
        }
        with pytest.raises(ValidationError):
            self.client.verify_payment(PAYMENT_HEADER, incomplete)

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_optional_fields_in_response_are_none_when_absent(self, mock_post):
        mock_post.return_value = _mock_response(
            {"isValid": True, "invalidReason": None}
        )
        result = self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert result.consensusProof is None
        assert result.reportId is None
        assert result.timestamp is None

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_consensus_proof_returned_when_present(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "isValid": True,
                "invalidReason": None,
                "consensusProof": "0xdeadbeef",
                "reportId": "rep_abc",
                "timestamp": 1700000001,
            }
        )
        result = self.client.verify_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert result.consensusProof == "0xdeadbeef"
        assert result.reportId == "rep_abc"


# ---------------------------------------------------------------------------
# settle_payment
# ---------------------------------------------------------------------------


class TestSettlePayment:
    def setup_method(self):
        self.client = X402Client(facilitator_url=FACILITATOR_URL)

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_successful_settlement_returns_tx_hash(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "success": True,
                "error": None,
                "txHash": "0xdeadbeef",
                "networkId": "base-sepolia",
                "consensusProof": "0xcafe",
                "timestamp": 1700000000,
            }
        )
        result = self.client.settle_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert isinstance(result, SettleResponse)
        assert result.success is True
        assert result.txHash == "0xdeadbeef"
        assert result.error is None

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_failed_settlement_returns_error(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "success": False,
                "error": "Invalid signature",
                "txHash": None,
                "networkId": "base-sepolia",
                "consensusProof": None,
                "timestamp": 1700000000,
            }
        )
        result = self.client.settle_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        assert result.success is False
        assert result.error == "Invalid signature"
        assert result.txHash is None

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_sends_correct_endpoint(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "success": True,
                "error": None,
                "txHash": "0x1",
                "networkId": "base-sepolia",
            }
        )
        self.client.settle_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        url = mock_post.call_args[0][0]
        assert url == f"{FACILITATOR_URL}/settle"

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_sends_correct_payload_structure(self, mock_post):
        mock_post.return_value = _mock_response(
            {
                "success": True,
                "error": None,
                "txHash": "0x1",
                "networkId": "base-sepolia",
            }
        )
        self.client.settle_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

        payload = mock_post.call_args[1]["json"]
        assert payload["paymentHeader"] == PAYMENT_HEADER
        assert payload["x402Version"] == 1
        assert payload["paymentRequirements"]["payTo"] == BASE_REQUIREMENTS["payTo"]

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_timeout_raises_timeout_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout()

        with pytest.raises(TimeoutError, match="timed out after"):
            self.client.settle_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)

    @patch("chaoschain_x402_client.client.requests.Session.post")
    def test_connection_error_raises_runtime_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("refused")

        with pytest.raises(RuntimeError, match="Settlement failed"):
            self.client.settle_payment(PAYMENT_HEADER, BASE_REQUIREMENTS)


# ---------------------------------------------------------------------------
# get_supported_schemes
# ---------------------------------------------------------------------------


class TestGetSupportedSchemes:
    def setup_method(self):
        self.client = X402Client(facilitator_url=FACILITATOR_URL)

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_returns_list_of_supported_schemes(self, mock_get):
        mock_get.return_value = _mock_response(
            {
                "kinds": [
                    {"scheme": "exact", "network": "base-sepolia"},
                    {"scheme": "exact", "network": "base-mainnet"},
                ]
            }
        )
        result = self.client.get_supported_schemes()

        assert isinstance(result, SupportedSchemesResponse)
        assert len(result.kinds) == 2
        assert result.kinds[0].scheme == "exact"
        assert result.kinds[0].network == "base-sepolia"

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_sends_correct_endpoint(self, mock_get):
        mock_get.return_value = _mock_response({"kinds": []})
        self.client.get_supported_schemes()

        url = mock_get.call_args[0][0]
        assert url == f"{FACILITATOR_URL}/supported"

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_timeout_raises_timeout_error(self, mock_get):
        mock_get.side_effect = requests.exceptions.Timeout()

        with pytest.raises(TimeoutError, match="timed out after"):
            self.client.get_supported_schemes()


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


class TestHealthCheck:
    def setup_method(self):
        self.client = X402Client(facilitator_url=FACILITATOR_URL)

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_returns_service_info(self, mock_get):
        mock_get.return_value = _mock_response(
            {
                "service": "ChaosChain x402 Facilitator",
                "version": "0.1.0",
                "mode": "managed",
            }
        )
        result = self.client.health_check()

        assert isinstance(result, ServiceInfo)
        assert result.service == "ChaosChain x402 Facilitator"
        assert result.mode == "managed"

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_sends_correct_endpoint(self, mock_get):
        mock_get.return_value = _mock_response(
            {"service": "x402", "version": "0.1.0", "mode": "managed"}
        )
        self.client.health_check()

        url = mock_get.call_args[0][0]
        assert url == f"{FACILITATOR_URL}/"

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_unreachable_facilitator_raises_runtime_error(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectionError("refused")

        with pytest.raises(RuntimeError, match="Health check failed"):
            self.client.health_check()

    @patch("chaoschain_x402_client.client.requests.Session.get")
    def test_timeout_raises_timeout_error(self, mock_get):
        mock_get.side_effect = requests.exceptions.Timeout()

        with pytest.raises(TimeoutError, match="timed out after"):
            self.client.health_check()


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------


class TestContextManager:
    def test_context_manager_calls_close(self):
        with patch.object(requests.Session, "close") as mock_close:
            with X402Client(facilitator_url=FACILITATOR_URL):
                pass
            mock_close.assert_called_once()

    def test_context_manager_closes_on_exception(self):
        with patch.object(requests.Session, "close") as mock_close:
            try:
                with X402Client(facilitator_url=FACILITATOR_URL):
                    raise ValueError("something went wrong")
            except ValueError:
                pass
            mock_close.assert_called_once()
