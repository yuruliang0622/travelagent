import json

import httpx
from google import genai
from google.genai import errors as genai_errors

from app.config import get_settings
from app.data.mock_data import JAPAN_PACK, itinerary_for_profile
from app.models import AgentChatRequest, AgentChatResponse, Itinerary, PlanTripRequest, PlanTripResponse, ReminderGroup


class TripPlanner:
    """Planner facade.

    Today this returns a validated mock itinerary. Next steps are:
    1. Retrieve user memory and Japan destination-pack chunks from MongoDB Atlas.
    2. Call Gemini on Vertex AI with a structured-output itinerary schema.
    3. Validate place and route assumptions with Google Maps Platform.
    4. Use the MongoDB MCP server for partner-track database and vector-search actions.
    5. Persist the itinerary before returning it.
    """

    def plan(self, request: PlanTripRequest) -> PlanTripResponse:
        profile = request.profile
        itinerary = itinerary_for_profile(profile)
        settings = get_settings()

        if settings.enable_live_gemini:
            gemini_itinerary = self._try_gemini_plan(request, itinerary)
            if gemini_itinerary is not None:
                return PlanTripResponse(
                    mode="gemini",
                    prompt=request.prompt,
                    destination_pack=JAPAN_PACK,
                    itinerary=gemini_itinerary,
                    memory_used=bool(profile and profile.memory_consent),
                    next_integrations=[
                        "Persist generated itinerary to MongoDB Atlas",
                        "Retrieve saved preferences with MongoDB Atlas Vector Search",
                        "Validate places and route timing with Google Maps Platform",
                        "Use weather data for packing and rainy-day alternates",
                    ],
                )

        return PlanTripResponse(
            mode="mock",
            prompt=request.prompt,
            destination_pack=JAPAN_PACK,
            itinerary=itinerary,
            memory_used=bool(profile and profile.memory_consent),
            next_integrations=[
                "Vertex AI Gemini structured itinerary generation",
                "MongoDB Atlas user memory, destination packs, and saved trips",
                "MongoDB Atlas Vector Search retrieval",
                "MongoDB MCP server partner-track integration",
                "Google Maps Places and Routes enrichment",
            ],
        )

    def chat(self, request: AgentChatRequest) -> AgentChatResponse:
        settings = get_settings()
        fallback = (
            "I can help with that from the current itinerary. For the strongest demo, "
            "ask me about a specific day, food stop, train transfer, or cultural note."
        )

        if not settings.enable_live_gemini:
            return AgentChatResponse(mode="mock", answer=fallback)

        prompt = self._build_chat_prompt(request)
        text = ""
        if settings.google_cloud_project:
            text = self._try_vertex_gemini_text(prompt)
        if not text and settings.google_api_key:
            text = self._try_api_key_gemini_text(prompt)

        return AgentChatResponse(
            mode="gemini" if text else "mock",
            answer=self._normalize_chat_answer(text) or fallback,
        )

    def _try_gemini_plan(
        self,
        request: PlanTripRequest,
        base_itinerary: Itinerary,
    ) -> Itinerary | None:
        settings = get_settings()
        prompt = self._build_gemini_prompt(request, base_itinerary)

        text = ""
        if settings.google_cloud_project:
            text = self._try_vertex_gemini_text(prompt)

        if not text and settings.google_api_key:
            text = self._try_api_key_gemini_text(prompt)

        if not text:
            return None

        try:
            generated = json.loads(text)
        except json.JSONDecodeError:
            return None

        return self._merge_gemini_notes(base_itinerary, generated)

    def _try_vertex_gemini_text(self, prompt: str) -> str:
        settings = get_settings()

        try:
            client = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
            )
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
                config={
                    "temperature": 0.5,
                    "response_mime_type": "application/json",
                },
            )
        except (genai_errors.APIError, ValueError):
            return ""

        return (response.text or "").strip()

    def _try_api_key_gemini_text(self, prompt: str) -> str:
        settings = get_settings()
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                },
            ],
            "generationConfig": {
                "temperature": 0.5,
                "responseMimeType": "application/json",
            },
        }

        try:
            with httpx.Client(timeout=20) as client:
                response = client.post(
                    url,
                    params={"key": settings.google_api_key},
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPError:
            return ""

        text = self._extract_gemini_text(response.json())
        return text

    def _build_gemini_prompt(
        self,
        request: PlanTripRequest,
        base_itinerary: Itinerary,
    ) -> str:
        profile = request.profile or base_itinerary.profile
        profile_json = profile.model_dump()

        return f"""
You are Trip Agent, an AI travel planner. Create concise tourist-facing planning
notes for a Japan itinerary. Keep it practical and culturally useful.

User prompt:
{request.prompt}

Traveler profile JSON:
{json.dumps(profile_json, ensure_ascii=False)}

Return only JSON with this exact shape:
{{
  "title": "short itinerary title",
  "subtitle": "one sentence summary",
  "culture_notes": ["3 short cultural or local context notes"],
  "packing_items": ["5 concise packing reminders"],
  "assumptions": ["3 short assumptions or caveats"]
}}
""".strip()

    def _build_chat_prompt(self, request: AgentChatRequest) -> str:
        conversation = "\n".join(
            f"{message.role}: {message.content}"
            for message in request.messages[-8:]
        )

        return f"""
You are Reiko, a friendly senior travel agent inside Trip Agent.
Answer the traveler using the itinerary context below. Keep the answer concise:
2-4 sentences, practical, warm, and specific. Do not invent confirmed bookings.
If the user asks for a change, suggest the change and ask for confirmation.

ITINERARY CONTEXT:
{request.trip_context}

RECENT CONVERSATION:
{conversation}

USER QUESTION:
{request.question}
""".strip()

    def _normalize_chat_answer(self, text: str) -> str:
        clean_text = text.strip()
        if not clean_text:
            return ""

        try:
            parsed = json.loads(clean_text)
        except json.JSONDecodeError:
            return clean_text

        if isinstance(parsed, dict):
            for key in ("answer", "response", "content", "text"):
                value = parsed.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        return clean_text

    def _extract_gemini_text(self, payload: dict[str, object]) -> str:
        candidates = payload.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            return ""

        first = candidates[0]
        if not isinstance(first, dict):
            return ""

        content = first.get("content")
        if not isinstance(content, dict):
            return ""

        parts = content.get("parts")
        if not isinstance(parts, list):
            return ""

        text_parts = [
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        ]
        return "\n".join(text_parts).strip()

    def _merge_gemini_notes(
        self,
        base_itinerary: Itinerary,
        generated: dict[str, object],
    ) -> Itinerary:
        title = generated.get("title")
        subtitle = generated.get("subtitle")
        culture_notes = generated.get("culture_notes")
        packing_items = generated.get("packing_items")
        assumptions = generated.get("assumptions")

        reminders = list(base_itinerary.reminders)
        if isinstance(packing_items, list):
            clean_items = [str(item) for item in packing_items if str(item).strip()]
            if clean_items:
                reminders = [
                    ReminderGroup(title="Gemini packing list", items=clean_items[:6]),
                    *reminders,
                ]

        clean_assumptions = []
        if isinstance(assumptions, list):
            clean_assumptions = [str(item) for item in assumptions if str(item).strip()]

        clean_culture_notes = []
        if isinstance(culture_notes, list):
            clean_culture_notes = [str(item) for item in culture_notes if str(item).strip()]

        merged_assumptions = [
            *clean_culture_notes[:3],
            *clean_assumptions[:3],
            *base_itinerary.assumptions,
        ]

        return base_itinerary.model_copy(
            update={
                "title": str(title).strip() if isinstance(title, str) and title.strip() else base_itinerary.title,
                "subtitle": str(subtitle).strip() if isinstance(subtitle, str) and subtitle.strip() else base_itinerary.subtitle,
                "reminders": reminders,
                "assumptions": merged_assumptions,
            },
        )


planner = TripPlanner()
