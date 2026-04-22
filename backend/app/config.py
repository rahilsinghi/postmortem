from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", "../.env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development")
    frontend_origin: str = Field(default="http://localhost:3000")
    anthropic_api_key: str | None = Field(default=None)
    github_token: str | None = Field(default=None)


@lru_cache
def get_settings() -> Settings:
    return Settings()
