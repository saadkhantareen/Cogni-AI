from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "cogni"
    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MIN: int = 1440
    LLM_PROVIDER: str = "mock"
    LLM_MODEL: str = ""
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    AI_DETECTOR: str = "heuristic"
    CORS_ORIGINS: str = "http://localhost:5173"
    MAX_UPLOAD_MB: int = 25

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
