"""Application settings loaded from environment (pydantic-settings)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Runtime
    environment: str = "development"
    cors_origins: str = "http://localhost:5173"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""  # backend ONLY

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Meta Marketing API
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_system_user_token: str = ""
    meta_ad_account_id: str = ""

    # Shopify
    shopify_shop_domain: str = ""
    shopify_admin_api_token: str = ""
    shopify_webhook_secret: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
