import logging

from google import genai
from google.auth import exceptions as google_auth_errors
from google.genai import errors as genai_errors
from google.genai import types

from app.config import get_settings

logger = logging.getLogger(__name__)


MAX_TOOL_ROUNDS = 1


def run_agent_loop(
    system_prompt: str,
    user_message: str,
    tools: list,
    tool_dispatcher,
) -> tuple[str, list[str]]:
    """Run a Gemini function-calling loop and return final text plus tool trace."""
    settings = get_settings()
    tool_trace: list[str] = []

    try:
        client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.5,
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        contents: list[types.Content] = [
            types.Content(role="user", parts=[types.Part(text=user_message)])
        ]

        for _ in range(MAX_TOOL_ROUNDS):
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=contents,
                config=config,
            )

            candidate = response.candidates[0] if response.candidates else None
            if candidate is None:
                break

            parts = candidate.content.parts or []
            function_calls = [part for part in parts if part.function_call]

            if not function_calls:
                return (response.text or "").strip(), tool_trace

            contents.append(candidate.content)
            function_responses: list[types.Part] = []
            for part in function_calls:
                function_call = part.function_call
                tool_trace.append(function_call.name)
                result = tool_dispatcher(function_call.name, dict(function_call.args or {}))
                function_responses.append(
                    types.Part.from_function_response(
                        name=function_call.name,
                        response={"result": result},
                    )
                )
            contents.append(types.Content(role="user", parts=function_responses))

    except (genai_errors.APIError, google_auth_errors.GoogleAuthError, OSError, ValueError):
        logger.exception("Gemini agent loop failed")
        return "", tool_trace


def generate_text(system_prompt: str, user_message: str, temperature: float = 0.7, model: str | None = None) -> str:
    """Run a simple Gemini text generation call without tools."""
    settings = get_settings()
    try:
        client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )
        response = client.models.generate_content(
            model=model or settings.gemini_model,
            contents=[types.Content(role="user", parts=[types.Part(text=user_message)])],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=temperature,
            ),
        )
        return (response.text or "").strip()
    except (genai_errors.APIError, google_auth_errors.GoogleAuthError, OSError, ValueError):
        logger.exception("Gemini text generation failed")
        return ""
