from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    frontend_origin: str = "http://localhost:3000"

    google_cloud_project: str | None = None
    google_cloud_location: str = "us-central1"
    gemini_model: str = "gemini-2.5-flash"
    google_api_key: str | None = None

    mongodb_uri: str | None = None
    mongodb_database: str = "trip_agent"
    mongodb_trips_collection: str = "trips"
    mongodb_profiles_collection: str = "profiles"
    mongodb_destination_packs_collection: str = "destination_packs"
    mongodb_vector_index: str = "trip_agent_vector_index"
    mongodb_mcp_server_url: str | None = None

    google_maps_api_key: str | None = None
    openweather_api_key: str | None = None

    serpapi_api_key: str | None = None

    enable_live_gemini: bool = True
    enable_live_maps: bool = True
    enable_live_flights: bool = True
    enable_mongodb_mcp: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
