(function () {
// Direction B — Map-on-top + vertical timeline (Xiaohongshu-style trip planner)
// Full-width map → day filter pills → timeline rail + stacked stop cards.
/* eslint-disable react/jsx-no-undef */
/* global AgentChat, CityMap, Ic, iconForStop */

// Real Leaflet map using CartoDB Positron tiles — soft greyscale base with
// custom blue circular markers and a dashed route line between stops.
function LeafletTripMap({ trip, activeDay }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);

  // Initialise map once.
  React.useEffect(() => {
    if (!containerRef.current || !window.L || mapRef.current) return;
    const L = window.L;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView([35.6896, 139.6917], 11);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: "© OpenStreetMap, © CARTO",
      }
    ).addTo(map);

    L.control.attribution({ position: "bottomright", prefix: "Leaflet" }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    // Resize after layout settles.
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-render markers / route whenever active day changes.
  React.useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();

    const isOverview = activeDay === 0;
    const blue = "#1F6FEB";

    // Custom circular blue marker (matches reference)
    const makeIcon = (label) =>
      L.divIcon({
        className: "trip-pin",
        html: `<div class="trip-pin__ring"><div class="trip-pin__dot">${label || ""}</div></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

    let pts = [];

    if (isOverview) {
      // City-level pins, one per unique city, dashed line between them.
      const seen = new Set();
      trip.days.forEach((d) => {
        if (seen.has(d.city)) return;
        seen.add(d.city);
        if (!d.latlng) return;
        pts.push({ latlng: d.latlng, label: d.city[0], title: `${d.city} · Day ${d.n}` });
      });
    } else {
      const day = trip.days.find((d) => d.n === activeDay);
      if (day && day.stops) {
        day.stops.forEach((s, i) => {
          const pos = s.latlng || day.latlng;
          if (!pos) return;
          pts.push({ latlng: pos, label: String(i + 1), title: `${s.t} · ${s.k}` });
        });
      }
    }

    if (pts.length === 0) return;

    // Dashed route line connecting points.
    const line = L.polyline(
      pts.map((p) => p.latlng),
      {
        color: blue,
        weight: 2.5,
        opacity: 0.85,
        dashArray: "6 8",
        lineCap: "round",
        lineJoin: "round",
      }
    );
    line.addTo(layer);

    pts.forEach((p) => {
      const m = L.marker(p.latlng, { icon: makeIcon(p.label), title: p.title });
      m.bindTooltip(p.title, { direction: "top", offset: [0, -14], opacity: 0.95 });
      m.addTo(layer);
    });

    // Fit bounds with padding.
    const bounds = L.latLngBounds(pts.map((p) => p.latlng));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: isOverview ? 7 : 13, animate: true });
  }, [trip, activeDay]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#EEF1F4" }}
    />
  );
}

const { loadUserProfile, saveUserProfileLocal, clearUserProfileLocal, profileForApi } = window.TripProfile;
const { saveProfile, saveTrip } = window.TripAgentApi;

const {
  normalizeStaticTrip,
  normalizeBackendTrip,
  majorRegionForDay,
} = window.TripNormalizers;
const { isLivePlanMode } = window.TripAgentFlow;
function DirectionB() {
  const [activeDay, setActiveDay] = React.useState(0);
  const [trip, setTrip] = React.useState(() => normalizeStaticTrip(window.TRIP));
  const [userProfile, setUserProfile] = React.useState(loadUserProfile);
  const [loginOpen, setLoginOpen] = React.useState(() => !loadUserProfile()?.profileSetupComplete);
  const [planningStatus, setPlanningStatus] = React.useState({ state: "idle", message: "" });
  const isOverview = activeDay === 0;
  const ad = trip.days[activeDay - 1] || trip.days[0];

  async function persistProfileToBackend(nextProfile) {
    try {
      await saveProfile(profileForApi(nextProfile));
    } catch {
      // The local profile still works if the backend is not running.
    }
  }

  function saveUserProfile(nextProfile) {
    setUserProfile(nextProfile);
    try {
      saveUserProfileLocal(nextProfile);
    } catch {
      // Profile still works for the current session if storage is blocked.
    }
    persistProfileToBackend(nextProfile);
  }

  function clearUserProfile() {
    setUserProfile(null);
    try {
      clearUserProfileLocal();
    } catch {
      // Ignore storage failures; the in-memory profile has already been reset.
    }
  }

  async function saveTripToBackend(itinerary) {
    try {
      await saveTrip(itinerary);
    } catch {
      // Saving is best-effort; the generated trip still renders in the browser.
    }
  }

  function applyGeneratedPlan(data, request = {}) {
    if (!data?.itinerary) return;
    const nextProfile = userProfile || data.itinerary.profile || { name: "Traveler", travelers: data.itinerary.profile?.travelers || 1 };
    const livePlan = isLivePlanMode(data.mode);
    const nextTrip = livePlan
      ? normalizeBackendTrip(data, nextProfile, request)
      : normalizeStaticTrip(window.TRIP, true);
    setTrip(nextTrip);
    setActiveDay(0);
    setPlanningStatus({
      state: livePlan ? "ready" : "fallback",
      message: livePlan
        ? `${nextTrip.title} is now reflected on the left.`
        : "The live plan was not available, so the left side is showing the Japan sample itinerary.",
    });
    saveTripToBackend(data.itinerary);
  }

  // Lightweight status/price chips derived from stop category so each card
  // feels populated without bloating trip-data.
  function iconNameForStop(stop) {
    const categoryIcons = {
      airport: "Plane",
      hotel: "Hotel",
      restaurant: "Food",
      attraction: "Camera",
      shopping: "Bag",
      transit: "Train",
      culture: "Temple",
      wellness: "Onsen",
    };
    return categoryIcons[String(stop.category || "").toLowerCase()] || window.iconForStop(stop.k);
  }

  function labelForStop(stop, iconName) {
    const labels = {
      airport: "AIRPORT",
      hotel: "HOTEL",
      restaurant: "RESTAURANT",
      attraction: "ATTRACTION",
      shopping: "SHOPPING",
      transit: "TRANSIT",
      culture: "CULTURE",
      wellness: "WELLNESS",
    };
    return labels[String(stop.category || "").toLowerCase()] || iconName.toUpperCase();
  }

  function metaForStop(stop, idx) {
    const cat = iconNameForStop(stop);
    const presets = {
      Train:   { status: "Reserved", price: "¥13,080", actions: ["Navigate", "Tickets"] },
      Plane:   { status: "Confirmed", price: "—", actions: ["Boarding pass"] },
      Hotel:   { status: "Booked", price: "—", actions: ["Navigate", "Check-in"] },
      Onsen:   { status: "Half-board", price: "Incl.", actions: ["Navigate", "Notes"] },
      Food:    { status: idx % 2 ? "Walk-in" : "Reservation", price: idx % 2 ? "~¥2,400/pp" : "¥6,800/pp", actions: ["Navigate", "Reviews", "Menu"] },
      Temple:  { status: "Open 6:00–18:00", price: "¥400", actions: ["Navigate", "About"] },
      Camera:  { status: "Photo spot", price: "Free", actions: ["Navigate", "Reviews"] },
      Bag:     { status: "Browse", price: "Varies", actions: ["Navigate"] },
      Walk:    { status: "Easy walk", price: "—", actions: ["Navigate"] },
    };
    return presets[cat] || presets.Walk;
  }

  function actionUrl(action, stopName, mapsUrl) {
    const name = encodeURIComponent(stopName || "");
    const maps = mapsUrl || `https://www.google.com/maps/search/?api=1&query=${name}`;
    if (action === "Navigate") return maps;
    return `https://www.google.com/search?q=${name}+${encodeURIComponent(action.toLowerCase())}`;
  }

  function highlightForStop(stop) {
    const helper = window.TripNormalizers?.simpleStopHighlight;
    const source = stop.highlight || stop.description || stop.note || knownHighlight(stop.k) || "";
    if (helper) return helper(source);
    const cleaned = String(source).replace(/\s*\u2b50.*$/, "").replace(/\s+/g, " ").trim();
    return cleaned.length > 92 ? `${cleaned.slice(0, 89).replace(/\s+\S*$/, "")}...` : cleaned;
  }

  function knownHighlight(title) {
    const text = String(title || "").toLowerCase();
    const rules = [
      [/narita|haneda|flight|airport/, "Arrival or departure anchor; keep this day light and realistic."],
      [/narita express|haruka|romancecar|bullet train|shinkansen|tokaido/, "Main transfer leg; this keeps the route from backtracking."],
      [/shibuya/, "Tokyo's famous crossing, neon streets, and first-night city energy."],
      [/omoide|izakaya/, "Tiny alley bars known for yakitori, beer, and old Tokyo atmosphere."],
      [/senso|asakusa|nakamise/, "Tokyo's classic temple district, famous for Kaminarimon and street snacks."],
      [/soba/, "Simple local lunch stop; soba is a lighter noodle meal between sightseeing blocks."],
      [/teamlab/, "Immersive digital art museum, popular for room-scale light installations."],
      [/akihabara/, "Anime, games, electronics, and arcade culture after dark."],
      [/open-air museum/, "Outdoor sculpture museum set in Hakone's mountain scenery."],
      [/owakudani|ropeway/, "Volcanic valley views; famous for black eggs and Mount Fuji glimpses."],
      [/ryokan|onsen|kaiseki/, "Traditional inn experience with hot springs and seasonal multi-course dinner."],
      [/nishiki/, "Kyoto food market known for pickles, seafood bites, tea sweets, and snacks."],
      [/kiyomizu/, "Historic hillside temple famous for its wooden stage and Kyoto views."],
      [/gion|maiko/, "Kyoto's preserved teahouse district and evening old-town atmosphere."],
      [/fushimi/, "Thousands of red torii gates; best early before tour groups arrive."],
      [/arashiyama|bamboo|tenryu/, "Bamboo grove and Zen temple area on Kyoto's western edge."],
      [/yudofu/, "Kyoto-style tofu meal, especially fitting near temple districts."],
      [/pontocho/, "Narrow riverside dining alley known for intimate Kyoto restaurants."],
      [/osaka castle/, "Osaka landmark tied to samurai-era history and broad castle park views."],
      [/dotonbori/, "Osaka's famous food street for takoyaki, okonomiyaki, and neon signs."],
      [/umeda sky/, "Observation deck known for wide Osaka night views."],
      [/% arabica|coffee/, "Kyoto coffee stop with a clean design feel before departure."],
    ];
    return rules.find(([pattern]) => pattern.test(text))?.[1] || "Worthwhile stop selected for route flow, local character, or first-time visitor value.";
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
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{trip.destinationLabel}</div>
            <div className="muted" style={{ fontSize: 12 }}>{trip.prepared_for} · {trip.travelers} travelers · {trip.dates}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn tag">Demo script</button>
          <button className="btn tag">Saved trips</button>
          <button className="btn primary">Approve route</button>
          <window.UserProfileMenu
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
          <div className="mono accent" style={{ marginBottom: 8 }}>{trip.sample ? "JAPAN CURATED SAMPLE" : "JAPAN-FIRST AGENT DEMO"}</div>
          <h1 className="serif" style={{ fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.035em" }}>{trip.title}</h1>
          {planningStatus.message && (
            <div className="muted" style={{ fontSize: 13, marginTop: 8, maxWidth: 620 }}>{planningStatus.message}</div>
          )}
        </div>
        <div className="card" style={{ padding: "16px 24px", display: "grid", gridTemplateColumns: "repeat(2, auto)", gap: 28 }}>
          {trip.stats.filter((s) => s.k !== "Stops" && s.k !== "Mode").map((s) => (
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
                {isOverview ? `Overview · ${trip.days.length} days · ${trip.stats.find((s) => s.k === "Cities")?.v || "multi-city"}` : `Day ${String(activeDay).padStart(2, "0")} · ${ad.stops.length} stops · ${ad.hours}`}
              </div>
            </div>
          </div>

          {/* Map area — real Leaflet (CartoDB Positron) map */}
          <div style={{ height: 480, position: "relative" }}>
            <LeafletTripMap trip={trip} activeDay={activeDay} />
          </div>
        </div>
      </section>

      {/* Day filter pills */}
      <section style={{ padding: "20px 40px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", overflowX: "auto", whiteSpace: "nowrap" }}>
        <button
          onClick={() => setActiveDay(0)}
          className="btn"
          style={{
            background: activeDay === 0 ? "var(--ink)" : "var(--tag)",
            color: activeDay === 0 ? "var(--bg)" : "var(--ink)",
            flex: "0 0 auto",
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
                flex: "0 0 auto",
              }}
            >
              D{d.n} · {majorRegionForDay(d)}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", flex: "0 0 auto" }} className="muted">{activeDay === 0 ? "All days" : `${ad.stops.length} stops · ${ad.hours}`}</span>
      </section>

      {/* Timeline section */}
      <section style={{ padding: "32px 40px 56px" }}>
        {activeDay === 0 ? (
          <window.OverviewList
            trip={trip}
            setActiveDay={setActiveDay}
            userProfile={userProfile}
            planningStatus={planningStatus}
          />
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
                  const cat = iconNameForStop(s);
                  const I = window.Ic[cat];
                  const m = metaForStop(s, i);
                  const highlight = highlightForStop(s);
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
                        <span className="muted" style={{ fontSize: 12 }}>{labelForStop(s, cat)}</span>
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

                      {highlight && (
                        <div className="ink2" style={{
                          fontSize: 13,
                          lineHeight: 1.45,
                          margin: "-4px 0 14px 52px",
                          maxWidth: 680,
                        }}>
                          {highlight}
                        </div>
                      )}

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
                        {s.duration && (
                          <span className="btn tag" style={{ padding: "5px 12px", fontSize: 12 }}>⏱ {s.duration}</span>
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
                          const sharedStyle = {
                            padding: "8px 14px", fontSize: 12, fontWeight: 600,
                            background: c.bg, color: c.fg,
                            textDecoration: "none", display: "inline-flex", alignItems: "center",
                          };
                          const url = actionUrl(a, s.k, s.url);
                          return (
                            <a key={a} href={url} target="_blank" rel="noreferrer" className="btn" style={sharedStyle}>
                              {j === 0 && <span style={{ display: "inline-flex", marginRight: 4 }}>📍</span>}
                              {a}
                            </a>
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

      <window.BookingSuggestions trip={trip} userProfile={userProfile} />

      <window.PackingList trip={trip} />

        </div>{/* /left column */}

        {/* Right rail — sticky AgentChat */}
        <aside style={{ position: "sticky", top: 16, height: "calc(100vh - 32px)", maxHeight: 880, marginTop: 32 }}>
          <window.AgentChat
            trip={trip}
            userProfile={userProfile}
            onProfileUpdate={saveUserProfile}
            onPlanGenerated={applyGeneratedPlan}
          />
        </aside>

      </div>{/* /two-column layout */}

      {loginOpen && (
        <window.LoginSheet
          userProfile={userProfile}
          planningStatus={planningStatus}
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


window.DirectionB = DirectionB;
})();
