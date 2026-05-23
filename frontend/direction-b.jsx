// Direction B — Map-on-top + vertical timeline (Xiaohongshu-style trip planner)
// Full-width map → day filter pills → timeline rail + stacked stop cards.
/* eslint-disable react/jsx-no-undef */
/* global AgentChat, CityMap, Ic, iconForStop */

const USER_PROFILE_STORAGE_KEY = "trip-agent:user-profile";

function loadUserProfile() {
  try {
    if (!window.localStorage) return null;
    return JSON.parse(window.localStorage.getItem(USER_PROFILE_STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function DirectionB() {
  const [activeDay, setActiveDay] = React.useState(0);
  const [userProfile, setUserProfile] = React.useState(loadUserProfile);
  const [loginOpen, setLoginOpen] = React.useState(false);
  const trip = window.TRIP;
  const isOverview = activeDay === 0;
  const ad = trip.days[activeDay - 1] || trip.days[0];

  function saveUserProfile(nextProfile) {
    setUserProfile(nextProfile);
    try {
      window.localStorage?.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    } catch {
      // Profile still works for the current session if storage is blocked.
    }
  }

  function clearUserProfile() {
    setUserProfile(null);
    try {
      window.localStorage?.removeItem(USER_PROFILE_STORAGE_KEY);
    } catch {
      // Ignore storage failures; the in-memory profile has already been reset.
    }
  }

  // Lightweight status/price chips derived from stop category so each card
  // feels populated without bloating trip-data.
  function metaForStop(stop, idx) {
    const cat = iconForStop(stop.k);
    const presets = {
      Train:   { status: "Reserved", price: "¥13,080", actions: ["Navigate", "Tickets"] },
      Plane:   { status: "Confirmed", price: "—", actions: ["Boarding pass"] },
      Hotel:   { status: "Booked", price: "—", actions: ["Navigate", "Check-in"] },
      Onsen:   { status: "Half-board", price: "Incl.", actions: ["Navigate", "Notes"] },
      Food:    { status: idx % 2 ? "Walk-in" : "Reservation", price: idx % 2 ? "~¥2,400/pp" : "¥6,800/pp", actions: ["Navigate", "Reviews", "Menu"] },
      Temple:  { status: "Open 6:00–18:00", price: "¥400", actions: ["Navigate", "About"] },
      Camera:  { status: "Photo spot", price: "Free", actions: ["Navigate", "Reviews"] },
      Walk:    { status: "Easy walk", price: "—", actions: ["Navigate"] },
    };
    return presets[cat] || presets.Walk;
  }

  return (
    <div className="artboard-root" style={{ width: "100%", maxWidth: 1440, margin: "0 auto", minHeight: 2400, padding: 0 }}>
      {/* Top app-bar */}
      <header style={{ background: "rgba(245,245,247,0.78)", backdropFilter: "blur(20px)", padding: "12px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--rule-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--ink)", display: "grid", placeItems: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C7.6 2 4 5.6 4 10c0 5.2 7.3 11.5 7.6 11.8.2.2.6.2.8 0C12.7 21.5 20 15.2 20 10c0-4.4-3.6-8-8-8zm0 11c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Japan · Spring &apos;26</div>
            <div className="muted" style={{ fontSize: 12 }}>The Sato Party · 2 travelers · April 12–18</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn tag">Documents</button>
          <button className="btn tag">Share</button>
          <button className="btn primary">Approve</button>
          <UserProfileMenu
            userProfile={userProfile}
            onOpen={() => setLoginOpen(true)}
          />
        </div>
      </header>

      {/* Two-column layout: content on the left, sticky agent chat on the right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20, padding: "0 20px 32px 0" }}>
        <div style={{ minWidth: 0 }}>

      {/* Compact title + stats strip */}
      <section style={{ padding: "32px 24px 24px 40px", display: "flex", justifyContent: "space-between", alignItems: "end", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div className="mono accent" style={{ marginBottom: 8 }}>SEVEN-DAY ITINERARY</div>
          <h1 className="serif" style={{ fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.035em" }}>Tokyo, Hakone, Kyoto, Osaka.</h1>
        </div>
        <div className="card" style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: 28 }}>
          {trip.stats.map((s) => (
            <div key={s.k} style={{ textAlign: "center" }}>
              <div className="serif" style={{ fontSize: 28, lineHeight: 1, letterSpacing: "-0.025em" }}>{s.v}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Full-width city map — switches city based on active day */}
      <section style={{ padding: "0 40px" }}>
        <div className="card-lg" style={{
          padding: 0,
          overflow: "hidden",
          background: "#EAECF0",
          position: "relative",
        }}>
          {/* Top-left info chip */}
          <div style={{ position: "absolute", top: 16, left: 16, zIndex: 2, display: "flex", gap: 8 }}>
            <div style={{
              padding: "10px 14px", borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(12px)",
              color: "var(--ink)",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "var(--shadow-md)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "#34C759", boxShadow: "0 0 0 3px rgba(52,199,89,0.2)" }} />
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {isOverview ? `Overview · ${trip.days.length} days · 4 cities` : `Day ${String(activeDay).padStart(2, "0")} · ${ad.stops.length} stops · ${ad.hours}`}
              </div>
            </div>
          </div>

          {/* Floating zoom controls — top right */}
          <div style={{ position: "absolute", top: 16, right: 16, display: "grid", gap: 6, zIndex: 2 }}>
            {["+", "−"].map((c) => (
              <button key={c} style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: "rgba(255,255,255,0.95)", color: "var(--ink)",
                backdropFilter: "blur(12px)",
                boxShadow: "var(--shadow-md)",
                fontSize: 18, cursor: "pointer",
              }}>{c}</button>
            ))}
            <button style={{
              width: 36, height: 36, borderRadius: 10, border: "none",
              background: "rgba(255,255,255,0.95)", color: "var(--ink)",
              backdropFilter: "blur(12px)",
              boxShadow: "var(--shadow-md)",
              display: "grid", placeItems: "center", cursor: "pointer",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Bottom-left active-day chip */}
          <div style={{
            position: "absolute", left: 16, bottom: 16, zIndex: 2,
            padding: "12px 16px", borderRadius: 12,
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            color: "var(--ink)",
            boxShadow: "var(--shadow-md)",
            maxWidth: 280,
          }}>
            <div className="mono" style={{ color: "var(--muted)", marginBottom: 4 }}>{isOverview ? "TRIP MAP" : "NOW VIEWING"}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1 }}>{isOverview ? "All days" : `Day ${String(ad.n).padStart(2, "0")}`}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{isOverview ? "Tokyo → Osaka" : ad.city}</div>
            </div>
            <div className="ink2" style={{ fontSize: 12, marginTop: 4 }}>{isOverview ? "Tokyo · Hakone · Kyoto · Osaka" : ad.title}</div>
          </div>

          {/* Map area */}
          <div style={{ height: 480, position: "relative" }}>
            <CityMap activeDay={activeDay} days={trip.days} setActiveDay={setActiveDay} />
          </div>
        </div>
      </section>

      {/* Day filter pills */}
      <section style={{ padding: "20px 40px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveDay(0)}
          className="btn"
          style={{
            background: activeDay === 0 ? "var(--ink)" : "var(--tag)",
            color: activeDay === 0 ? "var(--bg)" : "var(--ink)",
          }}
        >Overview</button>
        {trip.days.map((d) => {
          const active = activeDay === d.n;
          return (
            <button
              key={d.n}
              onClick={() => setActiveDay(d.n)}
              className="btn"
              style={{
                background: active ? "var(--ink)" : "var(--tag)",
                color: active ? "var(--bg)" : "var(--ink)",
                fontWeight: active ? 600 : 500,
              }}
            >
              D{d.n} · {d.city}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto" }} className="muted">{activeDay === 0 ? "All days" : `${ad.stops.length} stops · ${ad.hours}`}</span>
      </section>

      {/* Timeline section */}
      <section style={{ padding: "32px 40px 56px" }}>
        {activeDay === 0 ? (
          <OverviewList trip={trip} setActiveDay={setActiveDay} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 0 }}>
            {/* Left rail label */}
            <div style={{ paddingTop: 4 }}>
              <div className="mono muted" style={{ marginBottom: 8 }}>ITINERARY</div>
              <div className="serif" style={{ fontSize: 30, letterSpacing: "-0.025em", lineHeight: 1 }}>Day {String(ad.n).padStart(2, "0")}</div>
              <div className="ink2" style={{ fontSize: 14, marginTop: 6 }}>{ad.city}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>{ad.note}</div>
            </div>

            {/* Timeline rail + cards */}
            <div style={{ position: "relative", paddingLeft: 36 }}>
              {/* Vertical line */}
              <div style={{
                position: "absolute", left: 11, top: 8, bottom: 8,
                width: 2, background: "var(--rule)",
              }} />

              <div style={{ display: "grid", gap: 16 }}>
                {ad.stops.map((s, i) => {
                  const cat = iconForStop(s.k);
                  const I = Ic[cat];
                  const m = metaForStop(s, i);
                  const dotColor = ["#3F7A2A", "var(--accent)", "#C04A2E", "#D2B43C", "#5B7C99"][i % 5];
                  return (
                    <article key={s.t} className="card-lg" style={{ position: "relative", padding: "20px 24px" }}>
                      {/* Dot on the rail */}
                      <span style={{
                        position: "absolute", left: -31, top: 26,
                        width: 14, height: 14, borderRadius: 999,
                        background: dotColor,
                        boxShadow: "0 0 0 4px var(--bg)",
                      }} />

                      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
                        <span className="mono" style={{ color: "var(--ink-2)", fontSize: 12, fontWeight: 600 }}>{s.t}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{cat.toUpperCase()}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <span style={{
                          width: 40, height: 40, borderRadius: 12,
                          background: "var(--tag)",
                          display: "grid", placeItems: "center",
                          color: "var(--ink-2)",
                          flex: "0 0 40px",
                        }}><I /></span>
                        <h3 className="serif" style={{ fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{s.k}</h3>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        <span className="btn tag" style={{
                          padding: "5px 12px", fontSize: 12, background: "var(--accent-soft)", color: "var(--ink)",
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--accent)", display: "inline-block", marginRight: 6 }} />
                          {m.status}
                        </span>
                        {m.price !== "—" && (
                          <span className="btn tag" style={{ padding: "5px 12px", fontSize: 12 }}>{m.price}</span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {m.actions.map((a, j) => {
                          const colors = [
                            { bg: "var(--ink)",    fg: "var(--bg)" },
                            { bg: "#C44A2E",       fg: "#fff" },
                            { bg: "#E6A93B",       fg: "#2A1F00" },
                          ];
                          const c = colors[j] || colors[0];
                          return (
                            <button key={a} className="btn" style={{
                              padding: "8px 14px", fontSize: 12, fontWeight: 600,
                              background: c.bg, color: c.fg,
                            }}>
                              {j === 0 && <span style={{ display: "inline-flex", marginRight: 4 }}>📍</span>}
                              {a}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Packing */}
      <section style={{ padding: "0 40px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <h2 className="serif" style={{ fontSize: 40, letterSpacing: "-0.035em" }}>Packing checklist</h2>
          <div className="muted" style={{ fontSize: 14 }}>{trip.packing.reduce((a, p) => a + p.items.length, 0)} items · April 12–20°C</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {trip.packing.map((p) => {
            const catIcon = { Documents: "Bag", Wear: "Sun", Kit: "Compass", Cash: "Camera" }[p.cat] || "Bag";
            const I = Ic[catIcon];
            return (
              <div key={p.cat} className="card-lg" style={{ padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)" }}><I /></span>
                    <h3 className="serif" style={{ fontSize: 20, letterSpacing: "-0.015em" }}>{p.cat}</h3>
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>{p.items.length}</span>
                </div>
                <ul style={{ display: "grid", gap: 10 }}>
                  {p.items.map((it) => (
                    <li key={it} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--rule)", flex: "0 0 16px", transform: "translateY(2px)" }} />
                      <span style={{ fontSize: 14, lineHeight: 1.45 }}>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

        </div>{/* /left column */}

        {/* Right rail — sticky AgentChat */}
        <aside style={{ position: "sticky", top: 16, height: "calc(100vh - 32px)", maxHeight: 880, marginTop: 32 }}>
          <AgentChat
            trip={trip}
            userProfile={userProfile}
            onProfileUpdate={saveUserProfile}
          />
        </aside>

      </div>{/* /two-column layout */}

      {loginOpen && (
        <LoginSheet
          userProfile={userProfile}
          onSave={(nextProfile) => {
            saveUserProfile(nextProfile);
            setLoginOpen(false);
          }}
          onClear={() => {
            clearUserProfile();
            setLoginOpen(false);
          }}
          onClose={() => setLoginOpen(false)}
        />
      )}
    </div>
  );
}

function UserProfileMenu({ userProfile, onOpen }) {
  const initial = userProfile?.name?.trim()?.[0]?.toUpperCase() || "U";
  return (
    <button
      onClick={onOpen}
      aria-label={userProfile?.name ? "Open user profile" : "Sign in"}
      className="btn tag"
      style={{
        padding: "6px 8px 6px 6px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{
        width: 24,
        height: 24,
        borderRadius: 999,
        background: userProfile?.name ? "var(--ink)" : "var(--paper)",
        color: userProfile?.name ? "var(--bg)" : "var(--ink)",
        border: userProfile?.name ? "none" : "1px solid var(--rule)",
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 700,
      }}>
        {userProfile?.name ? initial : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>
        {userProfile?.name || "Sign in"}
      </span>
    </button>
  );
}

function LoginSheet({ userProfile, onSave, onClear, onClose }) {
  const [name, setName] = React.useState(userProfile?.name || "");
  const [email, setEmail] = React.useState(userProfile?.email || "");

  function submit(e) {
    e.preventDefault();
    const nextProfile = {
      ...(userProfile || {}),
      name: name.trim(),
      email: email.trim(),
      updatedAt: new Date().toISOString(),
    };
    onSave(nextProfile);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="User profile"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,0.16)",
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        padding: "64px 28px",
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          background: "var(--paper)",
          color: "var(--ink)",
          borderRadius: 18,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--rule-soft)",
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, lineHeight: 1.2, margin: 0, fontWeight: 650 }}>Traveler profile</h2>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.4, marginTop: 4 }}>
              Reiko uses this to personalize planning.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "none",
              background: "var(--tag)",
              color: "var(--ink)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600 }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={profileInputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 600 }}>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
            style={profileInputStyle}
          />
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
          <button
            type="button"
            onClick={onClear}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              fontSize: 12,
              fontWeight: 600,
              padding: "8px 0",
            }}
          >
            Reset
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={!name.trim()}
            style={{
              padding: "9px 15px",
              fontSize: 12,
              opacity: name.trim() ? 1 : 0.45,
            }}
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

const profileInputStyle = {
  width: "100%",
  border: "1px solid var(--rule-soft)",
  borderRadius: 12,
  background: "var(--bg)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: 13,
  outline: "none",
  padding: "10px 12px",
};

// Overview — shown when "Overview" tab is selected.
function OverviewList({ trip, setActiveDay }) {
  const summary = [
    {
      label: "Lodging",
      lines: [
        ["Park Hyatt Shinjuku", "Days 1 · 2"],
        ["Hakone Ryokan", "Day 3"],
        ["Hotel Granvia Kyoto", "Days 4 · 5 · 6"],
      ],
    },
    {
      label: "Flights",
      lines: [
        ["Arrive · Narita T1", "Apr 12 · 15:00"],
        ["Depart · KIX T1", "Apr 18 · 17:25"],
      ],
    },
    {
      label: "Transit",
      lines: [
        ["JR Pass · 7-day", "Green Car"],
        ["Suica", "iPhone Wallet preloaded ¥10,000"],
        ["ICOCA", "backup card"],
      ],
    },
    {
      label: "Estimated cost",
      lines: [
        ["¥1.7M for two", "≈ USD $11,420"],
        ["~¥120k per day", "all rail, lodging, transfers"],
      ],
    },
  ];

  const cityColors = { Tokyo: "#FDB94E", Hakone: "#34C759", Kyoto: "#A26FE8", Osaka: "#FF6B6B", Kansai: "#5B7C99" };

  return (
    <div>
      {/* Centered title section */}
      <div style={{ textAlign: "center", maxWidth: 760, margin: "0 auto 32px" }}>
        <h2 className="serif" style={{ fontSize: 42, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
          Japan · Seven Days
        </h2>
        <div className="muted" style={{ fontSize: 14, marginTop: 8 }}>
          {trip.dates} · Spring · {trip.travelers} travelers
        </div>
      </div>

      {/* 4 summary cards — compact single row */}
      <div style={{ maxWidth: 920, margin: "0 auto 32px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {summary.map((s) => (
          <div key={s.label} className="card-lg" style={{ padding: 18 }}>
            <div className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.08em", marginBottom: 12 }}>
              {s.label.toUpperCase()}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {s.lines.map(([title, sub], i) => (
                <div key={i}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Trip overview header */}
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 4px 12px" }}>
        <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Trip overview</h3>
      </div>

      {/* Day list */}
      <div style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 10 }}>
        {trip.days.map((d) => {
          const dot = cityColors[d.city] || "#86868B";
          return (
            <button
              key={d.n}
              onClick={() => setActiveDay(d.n)}
              className="daycard card-lg"
              style={{
                padding: "16px 20px", textAlign: "left",
                display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 14, alignItems: "center",
                background: "var(--paper)", border: "none", cursor: "pointer",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 999, background: dot }} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>D{d.n} · {d.title}</div>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{d.city} · {d.hours} · {d.stops.length} stops</div>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                <span style={{ display: "inline-flex" }}><Ic.Arrow /></span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.DirectionB = DirectionB;
