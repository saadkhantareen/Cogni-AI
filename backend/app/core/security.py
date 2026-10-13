def hash_password(password: str) -> str:
    raise NotImplementedError


def verify_password(password: str, password_hash: str) -> bool:
    raise NotImplementedError


def create_token(user_id: str, role: str) -> str:
    raise NotImplementedError


def decode_token(token: str) -> dict:
    raise NotImplementedError
