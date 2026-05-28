(function () {
// Presentational pieces for AgentChat. No backend calls live here.

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
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {connection.label} · Reiko agent
        </span>
        <span style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: connection.state === "offline" ? "#C44A2E" : "var(--muted)",
        }}>
          {connection.detail}
        </span>
      </span>
    </div>
  );
}

function QuickChoices({ options, onChoose }) {
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      padding: "2px 0 4px",
      justifyContent: "flex-start",
    }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChoose(option)}
          style={{
            border: "1px solid var(--rule-soft)",
            borderRadius: 999,
            background: "var(--paper)",
            color: "var(--ink)",
            padding: "8px 11px",
            fontSize: 12,
            lineHeight: 1.2,
            boxShadow: "var(--shadow-sm)",
            cursor: "pointer",
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function MultiChoices({ options, selected, onToggle, onSubmit }) {
  const count = selected.length;
  return (
    <div style={{
      display: "grid",
      gap: 7,
      padding: "2px 0 4px",
    }}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            style={{
              width: "100%",
              border: "1px solid var(--rule-soft)",
              borderRadius: 12,
              background: active ? "var(--ink)" : "var(--paper)",
              color: active ? "var(--bg)" : "var(--ink)",
              padding: "9px 11px",
              fontSize: 12,
              lineHeight: 1.25,
              boxShadow: "var(--shadow-sm)",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span>{option}</span>
            <span style={{ opacity: active ? 1 : 0.35 }}>{active ? "Selected" : "+"}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onSubmit(selected)}
        disabled={count === 0}
        style={{
          border: "none",
          borderRadius: 999,
          background: count ? "var(--ink)" : "var(--rule)",
          color: count ? "var(--bg)" : "var(--muted)",
          padding: "9px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: count ? "pointer" : "default",
          justifySelf: "start",
        }}
      >
        Continue with {count || 0} selected
      </button>
    </div>
  );
}

function ChatBubble({ role, text, typing, toolTrace, agentLabel, agentEmoji, bookingOptions, onSelectBookingOption }) {
  const isUser = role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
    }}>
      {!isUser && agentLabel && (
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.01em",
          color: "var(--muted)", marginBottom: 3, paddingLeft: 2,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          {agentEmoji && <span>{agentEmoji}</span>}
          <span>{agentLabel}</span>
        </div>
      )}
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
      {!isUser && toolTrace && toolTrace.length > 0 && (
        <div style={{
          fontSize: 11,
          opacity: 0.6,
          marginTop: 3,
          paddingLeft: 2,
        }}>
          Used: {toolTrace.map((t) => ({
            search_destinations: "🗺 Destination Research",
            find_restaurants: "🍽 Food Specialist",
            validate_places: "📍 Place Validation",
            search_flights: "✈️ Flight Agent",
            search_hotels: "🏨 Hotel Agent",
            search_trip_memory: "🧠 Memory Search",
          }[t] || t)).join(" · ")}
        </div>
      )}
      {!isUser && bookingOptions && (
        <BookingOptionGroup searches={bookingOptions} onSelect={onSelectBookingOption} />
      )}
    </div>
  );
}

function BookingOptionGroup({ searches, onSelect }) {
  const hotelGroups = searches.hotels?.cityGroups;

  return (
    <div style={{ width: "100%", marginTop: 8, display: "grid", gap: 8 }}>
      {searches.flights && (
        <div style={{ display: "grid", gap: 8 }}>
          {(searches.flights.options || []).slice(0, 3).map((option) => (
            <FlightOptionCard key={option.id} option={option} onClick={() => onSelect?.("flight", option)} />
          ))}
        </div>
      )}
      {searches.hotels && hotelGroups && hotelGroups.length > 0 && (
        // Multi-city: grouped by city with header per section
        <div style={{ display: "grid", gap: 12 }}>
          {hotelGroups.map((group) => (
            <div key={group.city} style={{ display: "grid", gap: 6 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: "var(--ink)",
                padding: "4px 2px 0",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>🏨 {group.city}</span>
                <span style={{ fontWeight: 500, color: "var(--muted)" }}>
                  · {group.nights} night{group.nights === 1 ? "" : "s"}
                </span>
              </div>
              {(group.options || []).slice(0, 2).map((option) => (
                <HotelOptionCard
                  key={`${group.city}-${option.id}`}
                  option={option}
                  onClick={() => onSelect?.("hotel", { ...option, city: group.city })}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {searches.hotels && !hotelGroups && (
        // Single-city: flat list (unchanged behavior)
        <div style={{ display: "grid", gap: 6 }}>
          {(searches.hotels.options || []).slice(0, 3).map((option) => (
            <HotelOptionCard
              key={option.id}
              option={option}
              onClick={() => onSelect?.("hotel", option)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HotelOptionCard({ option, onClick }) {
  const tags = (option.highlights || []).filter(Boolean).slice(0, 2);
  const reviews = Number(option.review_count || 0).toLocaleString();
  return (
    <button type="button" onClick={onClick} style={hotelCardStyle()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 750, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{option.name}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.25 }}>{option.city || option.area} · {option.area}</div>
        </div>
        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 750 }}>${Number(option.price_per_night_usd || 0).toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 10 }}>/night</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="muted" style={{ fontSize: 11 }}>{Number(option.rating || 0).toFixed(1)} rating · {reviews} reviews</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1F6FEB" }}>Review hotel</span>
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              padding: "4px 7px",
              borderRadius: 999,
              background: "var(--tag)",
              color: "var(--ink-2)",
              fontSize: 10,
              fontWeight: 650,
            }}>{tag}</span>
          ))}
        </div>
      )}
    </button>
  );
}

function FlightOptionCard({ option, onClick }) {
  const airlineCode = airlineInitials(option.airline);
  const depart = flightTime(option.depart_time);
  const arrive = flightTime(option.arrive_time);
  const stopLabel = option.stops === 0 ? "Nonstop" : `${option.stops} stop${option.stops > 1 ? "s" : ""}`;
  return (
    <button type="button" onClick={onClick} style={flightCardStyle()}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        borderBottom: "1px solid var(--rule-soft)",
        paddingBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            background: "#EAF2FF",
            color: "#1F6FEB",
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 750,
            flex: "0 0 24px",
          }}>{airlineCode}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{option.airline}</div>
            <div className="muted" style={{ fontSize: 10 }}>{option.flight_numbers?.slice(0, 2).join(" · ") || "Google Flights"}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div style={{ fontSize: 14, fontWeight: 750 }}>${option.price_usd.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 10 }}>round trip</div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 10,
        paddingTop: 10,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{depart.time}</div>
          <div className="muted" style={{ fontSize: 10 }}>{option.origin}</div>
        </div>
        <div style={{ textAlign: "center", minWidth: 74 }}>
          <div className="muted" style={{ fontSize: 10 }}>{option.duration || "Check time"}</div>
          <div style={{ height: 1, background: "var(--rule)", margin: "4px 0", position: "relative" }}>
            <span style={{
              position: "absolute",
              right: -2,
              top: -3,
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "var(--ink)",
            }} />
          </div>
          <div className="muted" style={{ fontSize: 10 }}>{stopLabel}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{arrive.time}{arrive.plusOne ? "+1" : ""}</div>
          <div className="muted" style={{ fontSize: 10 }}>{option.destination}</div>
        </div>
      </div>
    </button>
  );
}

function airlineInitials(value) {
  const words = String(value || "").split(/\s+|\//).filter(Boolean);
  return (words[0] || "FL").slice(0, 2).toUpperCase();
}

function flightTime(value) {
  const text = String(value || "");
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
  if (!match) return { time: text || "--:--", plusOne: false };
  return { time: match[2], plusOne: /arrival|narita|haneda/i.test(text) };
}

function flightCardStyle() {
  return {
    width: "100%",
    border: "1px solid var(--rule-soft)",
    borderRadius: 14,
    background: "var(--paper)",
    color: "var(--ink)",
    padding: "11px 12px",
    textAlign: "left",
    boxShadow: "var(--shadow-sm)",
    cursor: "pointer",
  };
}

function optionCardStyle() {
  return {
    width: "85%",
    border: "1px solid var(--rule-soft)",
    borderRadius: 12,
    background: "var(--paper)",
    color: "var(--ink)",
    padding: "9px 10px",
    display: "grid",
    gap: 3,
    textAlign: "left",
    fontSize: 12,
    lineHeight: 1.35,
    boxShadow: "var(--shadow-sm)",
    cursor: "pointer",
  };
}

function hotelCardStyle() {
  return {
    width: "100%",
    border: "1px solid var(--rule-soft)",
    borderRadius: 14,
    background: "var(--paper)",
    color: "var(--ink)",
    padding: "11px 12px",
    display: "grid",
    gap: 9,
    textAlign: "left",
    boxShadow: "var(--shadow-sm)",
    cursor: "pointer",
  };
}

function Dot({ delay }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 999, background: "var(--muted)",
      animation: `chatdot 1.2s ${delay}ms infinite ease-in-out`,
    }} />
  );
}

Object.assign(window, {
  ConnectionStatus,
  QuickChoices,
  MultiChoices,
  ChatBubble,
  BookingOptionGroup,
  HotelOptionCard,
  Dot,
});
})();
