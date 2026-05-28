(function () {
const AGENT_API_BASE = window.AGENT_API_BASE || "http://localhost:8000";

function backendOfflineMessage(error) {
  const suffix = error?.message ? ` (${error.message})` : "";
  return `I can't reach the FastAPI/Gemini backend at ${AGENT_API_BASE}. Make sure the backend is running on localhost:8000 and allows this frontend origin (${window.location.origin}), then try again.${suffix}`;
}

function backendRequestMessage(error) {
  const message = error?.message || "";
  if (message.includes("422")) {
    return "I reached the backend, but it rejected one profile or trip field. I cleaned up the request format, so try again now.";
  }
  return backendOfflineMessage(error);
}

async function checkBackendHealth(signal) {
  const response = await fetch(`${AGENT_API_BASE}/health`, {
    method: "GET",
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
    signal,
  });
  if (!response.ok) throw new Error(`health returned ${response.status}`);
  return response.json();
}

async function saveProfile(profilePayload) {
  const response = await fetch(`${AGENT_API_BASE}/api/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profilePayload),
  });
  if (!response.ok) throw new Error(`profile returned ${response.status}`);
  return response.json();
}

async function planTrip(payload) {
  const response = await fetch(`${AGENT_API_BASE}/api/agent/plan`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`plan returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

async function chatAgent(payload) {
  const response = await fetch(`${AGENT_API_BASE}/api/agent/chat`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`chat returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

async function searchFlights(payload) {
  const response = await fetch(`${AGENT_API_BASE}/api/booking/flights/search`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`flight search returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

async function searchHotels(payload) {
  const response = await fetch(`${AGENT_API_BASE}/api/booking/hotels/search`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`hotel search returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

async function saveTrip(itinerary) {
  const response = await fetch(`${AGENT_API_BASE}/api/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(itinerary),
  });
  if (!response.ok) throw new Error(`trip save returned ${response.status}`);
  return response.json();
}

window.TripAgentApi = {
  AGENT_API_BASE,
  backendOfflineMessage,
  backendRequestMessage,
  checkBackendHealth,
  saveProfile,
  planTrip,
  chatAgent,
  searchFlights,
  searchHotels,
  saveTrip,
};
})();
