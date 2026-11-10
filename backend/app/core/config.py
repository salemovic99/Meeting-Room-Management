from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: str = Field(default="development", alias="APP_ENV")
    app_url: str = Field(default="http://localhost", alias="APP_URL")
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    timezone: str = Field(default="Asia/Riyadh", alias="TIMEZONE")

    database_url: str = Field(
        default="postgresql+asyncpg://mrm:mrm@localhost:5432/mrm", alias="DATABASE_URL"
    )

    jwt_secret_key: str = Field(default="change-me-in-env", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    cookie_secure: bool = Field(default=True, alias="COOKIE_SECURE")

    device_token_secret: str = Field(default="change-me-device-secret", alias="DEVICE_TOKEN_SECRET")
    display_token_expire_minutes: int = Field(default=15, alias="DISPLAY_TOKEN_EXPIRE_MINUTES")

    login_max_failures: int = Field(default=5, alias="LOGIN_MAX_FAILURES")
    login_window_seconds: int = Field(default=900, alias="LOGIN_WINDOW_SECONDS")

    seed_admin_email: str | None = Field(default=None, alias="SEED_ADMIN_EMAIL")
    seed_admin_password: str | None = Field(default=None, alias="SEED_ADMIN_PASSWORD")

    # Background workers (outbox dispatcher, booking lifecycle). Disable in tests.
    run_workers: bool = Field(default=True, alias="RUN_WORKERS")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production:
        weak = {"change-me-in-env", "change-me-device-secret"}
        if s.jwt_secret_key in weak or s.device_token_secret in weak:
            raise RuntimeError("JWT_SECRET_KEY and DEVICE_TOKEN_SECRET must be set in production")
    return s


settings = get_settings()
