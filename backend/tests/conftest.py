import pytest

from app.core.ratelimit import llm_limiter, login_limiter

_REAL_LOGIN_MAX_CALLS = login_limiter.max_calls
_REAL_LLM_MAX_CALLS = llm_limiter.max_calls


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Every TestClient in this suite shares one fake IP/user set, and
    several existing tests legitimately log in or call LLM-backed endpoints
    more than the production limit within a single test (simulating many
    different users). Raise the ceiling by default so those tests reflect
    real per-user/per-IP behaviour rather than TestClient's shared identity;
    `test_hardening.py` restores the real limit for the tests that exist to
    verify it."""
    login_limiter._hits.clear()
    llm_limiter._hits.clear()
    login_limiter.max_calls = 10_000
    llm_limiter.max_calls = 10_000
    yield
    login_limiter.max_calls = _REAL_LOGIN_MAX_CALLS
    llm_limiter.max_calls = _REAL_LLM_MAX_CALLS
