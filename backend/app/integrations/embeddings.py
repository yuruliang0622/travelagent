from google import genai
from google.auth import exceptions as google_auth_errors
from google.genai import errors as genai_errors

from app.config import get_settings

_EMBEDDING_MODEL = "text-embedding-004"
_EMBEDDING_DIMS = 768


def embed_text(text: str) -> list[float]:
    """Generate a text embedding using Gemini text-embedding-004 via Vertex AI.

    Returns an empty list if credentials are missing or the call fails.
    """
    settings = get_settings()
    if not settings.google_cloud_project or not text.strip():
        return []

    try:
        client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )
        response = client.models.embed_content(
            model=_EMBEDDING_MODEL,
            contents=text.strip(),
        )
        embeddings = response.embeddings
        if embeddings and embeddings[0].values:
            return list(embeddings[0].values)
        return []
    except (genai_errors.APIError, google_auth_errors.GoogleAuthError, OSError, ValueError):
        return []
