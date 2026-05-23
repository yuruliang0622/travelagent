// AgentChat — Reiko talks to the local FastAPI/Gemini agent backend,
// grounded in the current trip data.

const AGENT_API_BASE = window.AGENT_API_BASE || "http://localhost:8000";

function backendOfflineMessage(error) {
  const suffix = error?.message ? ` (${error.message})` : "";
  return `I can't reach the FastAPI/Gemini backend at ${AGENT_API_BASE}. Make sure the backend is running on localhost:8000 and allows this frontend origin (${window.location.origin}), then try again.${suffix}`;
}

const PROFILE_STEPS = [
  {
    key: "name",
    question: "Before we shape this trip around you, what should I call you?",
    placeholder: "Your name",
  },
  {
    key: "travelers",
    question: "How many travelers should I plan for, and who is coming with you?",
    placeholder: "2 travelers — me and my partner",
  },
  {
    key: "travelStyle",
    question: "What travel style fits you best: relaxed, balanced, ambitious, luxury, budget, food-first, culture-first?",
    placeholder: "Balanced, food-first, not too rushed",
  },
  {
    key: "interests",
    question: "What should I remember about your interests or constraints? Food, hotels, mobility, allergies, pace, must-sees — anything useful.",
    placeholder: "Great food, ryokan, no shellfish, easy mornings",
  },
];

function nextProfileStep(profile) {
  return PROFILE_STEPS.find((step) => !profile?.[step.key]) || null;
}

function profileGreeting(userProfile) {
  const step = nextProfileStep(userProfile);
  if (step) {
    return {
      role: "assistant",
      content: `Hi — I'm Reiko at Meridian. Before I personalize this itinerary, I'll build your traveler profile.\n\n${step.question}`,
    };
  }
  return {
    role: "assistant",
    content:
      `Hi ${userProfile?.name || "there"} — I'm Reiko at Meridian. I built this 7-day Japan loop for you and I have your traveler profile loaded. Ask me anything: tweak a day, swap a city, add a reservation, or just check what's already booked.`,
  };
}

function profileContext(userProfile) {
  if (!userProfile) return "Traveler profile: not collected yet.";
  const entries = [
    ["Name", userProfile.name],
    ["Email", userProfile.email],
    ["Travelers", userProfile.travelers],
    ["Travel style", userProfile.travelStyle],
    ["Interests and constraints", userProfile.interests],
  ].filter(([, value]) => value);
  return `Traveler profile:\n${entries.map(([key, value]) => `${key}: ${value}`).join("\n")}`;
}

function AgentChat({ trip, userProfile, onProfileUpdate }) {
  const [messages, setMessages] = React.useState(() => [profileGreeting(userProfile)]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [interviewStep, setInterviewStep] = React.useState(() => nextProfileStep(userProfile));
  const [connection, setConnection] = React.useState({
    state: "checking",
    label: "Checking backend",
    detail: `Looking for FastAPI on ${AGENT_API_BASE}`,
  });
  const threadRef = React.useRef(null);

  // Keep latest message in view.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function checkBackend({ quiet = false } = {}) {
    if (!quiet) {
      setConnection({
        state: "checking",
        label: "Checking backend",
        detail: `Looking for FastAPI on ${AGENT_API_BASE}`,
      });
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${AGENT_API_BASE}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`health returned ${response.status}`);
      const data = await response.json();
      const geminiMode = data.live_gemini_enabled ? "Gemini live" : "Gemini mock mode";
      setConnection({
        state: "connected",
        label: "Backend connected",
        detail: `FastAPI on localhost:8000 · ${geminiMode}`,
      });
      return true;
    } catch {
      setConnection({
        state: "offline",
        label: "Backend offline",
        detail: `Cannot reach ${AGENT_API_BASE} from ${window.location.origin}`,
      });
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  React.useEffect(() => {
    checkBackend();
  }, []);

  React.useEffect(() => {
    const nextStep = nextProfileStep(userProfile);
    setInterviewStep(nextStep);
  }, [userProfile]);

  // Compact trip context for the model.
  const tripContext = React.useMemo(() => {
    const days = trip.days
      .map((d) => `D${d.n} ${d.city}: ${d.title} (${d.hours}). Stops: ${d.stops.map((s) => `${s.t} ${s.k}`).join(" | ")}. Note: ${d.note}`)
      .join("\n");
    return `Trip: ${trip.title}. ${trip.subtitle}. ${trip.dates}. ${trip.travelers} travelers (${trip.prepared_for}).\n${profileContext(userProfile)}\n${days}`;
  }, [trip, userProfile]);

  function handleProfileAnswer(answer) {
    const step = interviewStep || nextProfileStep(userProfile);
    if (!step) return false;

    const nextProfile = {
      ...(userProfile || {}),
      [step.key]: answer,
      updatedAt: new Date().toISOString(),
    };
    const followingStep = nextProfileStep(nextProfile);
    nextProfile.completed = !followingStep;
    onProfileUpdate(nextProfile);
    setInterviewStep(followingStep);

    const reply = followingStep
      ? `Got it.\n\n${followingStep.question}`
      : `Perfect — your traveler profile is ready. I'll use it when I answer, make tradeoffs, and suggest changes.\n\nWhat would you like to adjust first?`;

    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    return true;
  }

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);

    if (interviewStep) {
      handleProfileAnswer(q);
      return;
    }

    setBusy(true);
    try {
      setConnection((prev) => ({
        ...prev,
        state: prev.state === "connected" ? "connected" : "checking",
        label: prev.state === "connected" ? prev.label : "Contacting backend",
      }));
      const response = await fetch(`${AGENT_API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          trip_context: tripContext,
          messages: next.slice(-8),
        }),
      });
      if (!response.ok) throw new Error(`chat returned ${response.status}`);
      const data = await response.json();
      setConnection((prev) => ({
        state: "connected",
        label: "Backend connected",
        detail: prev.detail?.includes("Gemini") ? prev.detail : "FastAPI on localhost:8000",
      }));
      const reply = data.answer || "I can help with that, but I need a little more detail.";
      setMessages((prev) => [...prev, { role: "assistant", content: String(reply).trim() }]);
    } catch (err) {
      setConnection({
        state: "offline",
        label: "Backend offline",
        detail: `Cannot reach ${AGENT_API_BASE} from ${window.location.origin}`,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: backendOfflineMessage(err) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: "var(--paper)",
      color: "var(--ink)",
      borderRadius: "var(--r-lg)",
      boxShadow: "var(--shadow-md)",
      padding: 0,
      overflow: "hidden",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        borderBottom: "1px solid var(--rule-soft)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #FDB94E, #C0492A)",
            display: "grid", placeItems: "center",
            fontSize: 12, fontWeight: 700, color: "#2A1F00",
            flex: "0 0 32px",
          }}>R</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>Reiko — Meridian</div>
            <ConnectionStatus connection={connection} />
          </div>
        </div>
        <button style={{
          width: 28, height: 28, borderRadius: 999, border: "none",
          background: "var(--tag)", color: "var(--ink)",
          cursor: "pointer", display: "grid", placeItems: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="18" cy="12" r="1.5" fill="currentColor" />
            <circle cx="6"  cy="12" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Conversation thread */}
      <div
        ref={threadRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 16px 4px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} text={m.content} />
        ))}
        {busy && <ChatBubble role="assistant" typing />}
      </div>

      {/* Composer */}
      <div style={{
        margin: "10px 12px 12px",
        padding: 4,
        background: "var(--bg)",
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={interviewStep?.placeholder || "Ask Reiko anything…"}
          disabled={busy}
          style={{
            flex: 1, padding: "8px 12px",
            background: "transparent", border: "none", outline: "none",
            color: "var(--ink)", fontSize: 13, fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          style={{
            width: 30, height: 30, borderRadius: 999, border: "none",
            background: input.trim() && !busy ? "var(--ink)" : "var(--rule)",
            color: input.trim() && !busy ? "var(--bg)" : "var(--muted)",
            cursor: input.trim() && !busy ? "pointer" : "default",
            display: "grid", placeItems: "center",
            transition: "background 150ms ease",
          }}
          aria-label="Send"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ConnectionStatus({ connection }) {
  const palette = {
    connected: { dot: "#34C759", ring: "rgba(52,199,89,0.18)" },
    checking: { dot: "#E6A93B", ring: "rgba(230,169,59,0.22)" },
    offline: { dot: "#C44A2E", ring: "rgba(196,74,46,0.18)" },
  }[connection.state] || { dot: "var(--muted)", ring: "rgba(134,134,139,0.18)" };

  return (
    <div
      title={connection.detail}
      style={{
        fontSize: 11,
        color: "var(--muted)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: palette.dot,
        boxShadow: `0 0 0 3px ${palette.ring}`,
        flex: "0 0 6px",
      }} />
      <span style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {connection.label} · Reiko agent
      </span>
    </div>
  );
}

function ChatBubble({ role, text, typing }) {
  const isUser = role === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
    }}>
      <div style={{
        maxWidth: "85%",
        padding: "8px 12px",
        borderRadius: 16,
        borderBottomLeftRadius: isUser ? 16 : 4,
        borderBottomRightRadius: isUser ? 4 : 16,
        background: isUser ? "var(--ink)" : "var(--bg)",
        color: isUser ? "var(--bg)" : "var(--ink)",
        fontSize: 13,
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
      }}>
        {typing ? (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <Dot delay={0} /><Dot delay={150} /><Dot delay={300} />
          </span>
        ) : text}
      </div>
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 999, background: "var(--muted)",
      animation: `chatdot 1.2s ${delay}ms infinite ease-in-out`,
    }} />
  );
}

window.AgentChat = AgentChat;
