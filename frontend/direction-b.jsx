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
  const [trip, setTrip] = React.useState(null);
  const [userProfile, setUserProfile] = React.useState(loadUserProfile);
  const [loginOpen, setLoginOpen] = React.useState(() => !loadUserProfile()?.profileSetupComplete);
  const [planningStatus, setPlanningStatus] = React.useState({ state: "idle", message: "" });
  const [savedTripsOpen, setSavedTripsOpen] = React.useState(false);
  const [savedTrips, setSavedTrips] = React.useState([]);
  const [savedTripsBusy, setSavedTripsBusy] = React.useState(false);
  const isOverview = activeDay === 0;
  const ad = trip ? (trip.days[activeDay - 1] || trip.days[0]) : null;

  async function openSavedTrips() {
    setSavedTripsOpen(true);
    setSavedTripsBusy(true);
    try {
      const data = await window.TripAgentApi.listTrips();
      setSavedTrips(data.trips || []);
    } catch {
      setSavedTrips([]);
    } finally {
      setSavedTripsBusy(false);
    }
  }

  async function loadAndViewTrip(tripId) {
    setSavedTripsBusy(true);
    try {
      const data = await window.TripAgentApi.getTrip(tripId);
      const itinerary = data.itinerary || data;
      const nextTrip = itinerary?.days
        ? normalizeBackendTrip(
            {
              ...data,
              itinerary,
              place_details: data.place_details || {},
              destination_pack: data.destination_pack || { country: itinerary.destination_pack_id || "Saved trip" },
            },
            userProfile,
            {}
          )
        : null;
      if (nextTrip) {
        setTrip(nextTrip);
        setActiveDay(0);
        setPlanningStatus({ state: "ready", message: `Loaded: ${nextTrip.title}` });
      }
      setSavedTripsOpen(false);
    } catch {
      // silently fail
    } finally {
      setSavedTripsBusy(false);
    }
  }

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

  async function saveTripToBackend(planPayload) {
    try {
      const payload = planPayload?.itinerary
        ? { itinerary: planPayload.itinerary, place_details: planPayload.place_details || {} }
        : planPayload;
      await saveTrip(payload);
    } catch {
      // Saving is best-effort; the generated trip still renders in the browser.
    }
  }

  function applyGeneratedPlan(data, request = {}) {
    if (!data?.itinerary) return;
    const nextProfile = userProfile || data.itinerary.profile || { name: "Traveler", travelers: data.itinerary.profile?.travelers || 1 };
    const isCuratedDemo = Array.isArray(data.tool_trace) && data.tool_trace.includes("curated_japan_demo");
    const nextTrip = normalizeBackendTrip(data, nextProfile, request);
    setTrip(nextTrip);
    setActiveDay(0);
    setPlanningStatus({
      state: "ready",
      message: isCuratedDemo
        ? "The curated Japan demo is now reflected on the left."
        : `${nextTrip.title} is now reflected on the left.`,
    });
    saveTripToBackend(data);
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

  function fmt(n) {
    if (n == null) return '';
    return Number(n).toLocaleString();
  }

  function metaForStop(stop, idx) {
    // Rating — inline stars + review count
    let rating = null;
    if (stop.rating != null) {
      const stars = '⭐ ' + stop.rating.toFixed(1);
      const count = stop.userRatingsTotal ? ` (${fmt(stop.userRatingsTotal)} reviews)` : '';
      rating = stars + count;
    }

    // Opening hours — today's entry
    let hours = null;
    const oh = stop.openingHours;
    if (oh && oh.length) {
      const today = new Date().getDay();
      const i = today === 0 ? 6 : today - 1;
      hours = oh[i] || oh[0] || null;
    }

    // Price level
    const priceLabels = { 0: 'Free', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
    let price = (stop.priceLevel != null) ? (priceLabels[stop.priceLevel] || null) : null;

    // Action buttons
    const actions = [];
    const mapsUrl = stop.googleMapsUrl || stop.url || '';
    if (mapsUrl) {
      actions.push({ label: 'Navigate', url: mapsUrl });
    }
    if (stop.website) {
      actions.push({ label: 'Website', url: stop.website });
    }

    return { rating, hours, price, actions };
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
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{trip ? trip.destinationLabel : "Reiko"}</div>
            <div className="muted" style={{ fontSize: 12 }}>{trip ? `${trip.prepared_for} · ${trip.travelers} travelers · ${trip.dates}` : "Your Personal Travel Curator"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn tag" onClick={openSavedTrips}>Saved trips</button>
          <window.UserProfileMenu
            userProfile={userProfile}
            onOpen={() => setLoginOpen(true)}
          />
        </div>
      </header>

      {/* Two-column layout: content on the left, sticky agent chat on the right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20, padding: "0 20px 32px 0" }}>
        <div style={{ minWidth: 0 }}>

      {trip ? (
      <>

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

                      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                        {m.rating && (
                          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{m.rating}</span>
                        )}
                        {m.hours && (
                          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>🕐 {m.hours}</span>
                        )}
                        {m.price && (
                          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>💰 {m.price}</span>
                        )}
                        {s.duration && (
                          <span className="btn tag" style={{ padding: "5px 12px", fontSize: 12 }}>⏱ {s.duration}</span>
                        )}
                      </div>

                      {m.actions.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {m.actions.map((a, j) => {
                            const colors = [
                              { bg: "var(--ink)",    fg: "var(--bg)" },
                              { bg: "#C44A2E",       fg: "#fff" },
                            ];
                            const c = colors[j] || colors[0];
                            const sharedStyle = {
                              padding: "8px 14px", fontSize: 12, fontWeight: 600,
                              background: c.bg, color: c.fg,
                              textDecoration: "none", display: "inline-flex", alignItems: "center",
                            };
                            const icons = ['📍', '🌐'];
                            return (
                              <a key={a.label} href={a.url} target="_blank" rel="noreferrer" className="btn" style={sharedStyle}>
                                <span style={{ display: "inline-flex", marginRight: 4 }}>{icons[j] || ''}</span>
                                {a.label}
                              </a>
                            );
                          })}
                        </div>
                      )}
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

      </>
      ) : (
        /* Empty state — make the first screen feel like a working travel desk. */
        <section style={{ padding: "72px 40px 60px" }}>
          <div style={{
            maxWidth: 980,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(280px, 0.95fr)",
            gap: 28,
            alignItems: "stretch",
          }}>
            <div style={{
              minHeight: 430,
              borderRadius: 24,
              padding: "34px 36px",
              background: "linear-gradient(145deg, #F7F4ED 0%, #EEF3EE 48%, #EEF2F6 100%)",
              border: "1px solid rgba(210,210,215,0.78)",
              boxShadow: "0 18px 48px rgba(29,29,31,0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
              position: "relative",
            }}>
              <svg
                viewBox="0 0 620 430"
                role="img"
                aria-label="Reiko welcomes the traveler"
                style={{ width: "100%", height: "100%", minHeight: 430, display: "block", position: "relative" }}
              >
                <defs>
                  <linearGradient id="welcome-sky" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFF9EF" />
                    <stop offset="58%" stopColor="#EDF5EE" />
                    <stop offset="100%" stopColor="#EAF2F7" />
                  </linearGradient>
                  <linearGradient id="welcome-sun" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFD98E" />
                    <stop offset="100%" stopColor="#F3A45E" />
                  </linearGradient>
                  <filter id="welcome-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#1D1D1F" floodOpacity="0.12" />
                  </filter>
                </defs>

                <rect x="0" y="0" width="620" height="430" rx="24" fill="url(#welcome-sky)" />
                <circle cx="548" cy="44" r="118" fill="#FFFEFA" opacity="0.58" />
                <circle cx="92" cy="80" r="34" fill="url(#welcome-sun)" opacity="0.82" />
                <path d="M426 64C472 72 509 103 548 145" fill="none" stroke="#D9E2DA" strokeWidth="3" strokeDasharray="7 9" strokeLinecap="round" />
                <path d="M548 145L530 139L540 158Z" fill="#9AB7A1" />

                <g filter="url(#welcome-soft-shadow)">
                  <rect x="298" y="70" width="250" height="132" rx="30" fill="#FFFEFA" />
                  <path d="M342 192L318 226L374 198Z" fill="#FFFEFA" />
                  <text x="328" y="116" fill="#1D1D1F" fontFamily="var(--sans)" fontSize="22" fontWeight="800">
                    {userProfile ? "Welcome back!" : "Hi, I am Reiko!"}
                  </text>
                  <text x="328" y="148" fill="#55565C" fontFamily="var(--sans)" fontSize="17" fontWeight="500">
                    {userProfile ? "Your travel concierge is ready." : "Your travel concierge is here."}
                  </text>
                  <text x="328" y="176" fill="#55565C" fontFamily="var(--sans)" fontSize="17" fontWeight="500">
                    I will handle the route.
                  </text>
                </g>

                <g transform="translate(92 116)" filter="url(#welcome-soft-shadow)">
                  <ellipse cx="132" cy="304" rx="130" ry="24" fill="#CED9D1" opacity="0.55" />
                  <rect x="176" y="222" width="82" height="72" rx="15" fill="#E8B66F" />
                  <path d="M195 222V211C195 199 239 199 239 211V222" fill="none" stroke="#7A5B39" strokeWidth="8" strokeLinecap="round" />
                  <rect x="196" y="238" width="12" height="12" rx="3" fill="#FFE8BC" />
                  <rect x="226" y="238" width="36" height="10" rx="5" fill="#BF7B42" opacity="0.48" />
                  <circle cx="199" cy="296" r="7" fill="#665245" />
                  <circle cx="238" cy="296" r="7" fill="#665245" />

                  <path d="M74 252C81 222 98 204 132 204C166 204 183 222 190 252L178 318H84Z" fill="#2F4B44" />
                  <path d="M104 222H160L151 318H113Z" fill="#FFFEFA" />
                  <path d="M104 222L125 318H84L74 252C78 234 88 224 104 222Z" fill="#3F6E64" />
                  <path d="M160 222L139 318H178L190 252C186 234 176 224 160 222Z" fill="#3F6E64" />
                  <path d="M111 318V344" stroke="#2F4B44" strokeWidth="18" strokeLinecap="round" />
                  <path d="M157 318V344" stroke="#2F4B44" strokeWidth="18" strokeLinecap="round" />
                  <path d="M94 350H124" stroke="#4A3728" strokeWidth="10" strokeLinecap="round" />
                  <path d="M144 350H174" stroke="#4A3728" strokeWidth="10" strokeLinecap="round" />
                  <path d="M87 190C73 211 72 246 91 264C110 282 158 283 172 263C188 240 184 211 171 190Z" fill="#F2CFAB" />
                  <path d="M86 159C90 133 174 133 179 159L174 174H91Z" fill="#30453F" />
                  <rect x="91" y="150" width="83" height="20" rx="10" fill="#3F6E64" />
                  <rect x="108" y="138" width="48" height="20" rx="9" fill="#3F6E64" />
                  <circle cx="132" cy="154" r="5" fill="#E8B66F" />
                  <path d="M78 182C78 142 185 142 185 182C185 196 180 204 174 211C174 176 96 175 86 211C80 204 78 195 78 182Z" fill="#4A3728" />
                  <path d="M79 190C65 198 63 226 77 235" fill="none" stroke="#4A3728" strokeWidth="5" strokeLinecap="round" />
                  <path d="M185 190C199 198 201 226 187 235" fill="none" stroke="#4A3728" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="112" cy="214" r="4" fill="#2C1810" />
                  <circle cx="152" cy="214" r="4" fill="#2C1810" />
                  <circle cx="103" cy="230" r="9" fill="#F3A7A5" opacity="0.55" />
                  <circle cx="161" cy="230" r="9" fill="#F3A7A5" opacity="0.55" />
                  <path d="M118 239C126 247 142 247 150 239" fill="none" stroke="#C97D60" strokeWidth="4" strokeLinecap="round" />
                  <path d="M119 265L132 279L145 265" fill="#C34A3A" />
                  <path d="M122 267L132 259L142 267L132 277Z" fill="#B84033" />
                  <circle cx="132" cy="294" r="4" fill="#D9B772" />
                  <circle cx="132" cy="312" r="4" fill="#D9B772" />
                  <path d="M77 256C45 252 32 223 49 206C64 191 82 212 87 238" fill="#F2CFAB" />
                  <path d="M47 207C32 199 21 195 12 195" fill="none" stroke="#3F6E64" strokeWidth="8" strokeLinecap="round" />
                  <path d="M183 256C222 244 230 215 208 203C189 193 180 213 177 239" fill="#F2CFAB" />
                  <path d="M213 207C235 193 249 174 257 154" fill="none" stroke="#3F6E64" strokeWidth="8" strokeLinecap="round" />
                  <ellipse cx="261" cy="151" rx="42" ry="10" fill="#6B5A4A" />
                  <rect x="226" y="120" width="45" height="31" rx="6" fill="#FFFEFA" />
                  <path d="M233 130H262M233 139H252" stroke="#AAB8AF" strokeWidth="3" strokeLinecap="round" />
                  <rect x="273" y="126" width="32" height="25" rx="5" fill="#DCE9E0" />
                  <path d="M280 133L288 130L298 134V144L288 147L280 144Z" fill="#9AB7A1" />
                </g>

                <g transform="translate(70 54)">
                  <rect x="0" y="0" width="112" height="72" rx="16" fill="#FFFEFA" opacity="0.9" />
                  <path d="M18 18L44 10L72 20L100 12V54L72 62L44 52L18 60Z" fill="#DCE9E0" />
                  <path d="M44 10V52M72 20V62" stroke="#B8CBBE" strokeWidth="2" />
                  <circle cx="78" cy="32" r="7" fill="#E66F51" />
                  <path d="M78 28C73 35 78 43 78 43C78 43 83 35 78 28Z" fill="#C94D35" />
                </g>
              </svg>
            </div>

            <div className="card-lg" style={{
              padding: "26px 28px 26px",
              border: "1px solid var(--rule-soft)",
              display: "grid",
              alignContent: "center",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <div>
                  <div className="mono accent">USER FLOW</div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 7 }}>
                    From profile to itinerary
                  </div>
                </div>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: "var(--tag)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--ink-2)",
                  fontSize: 18,
                  fontWeight: 800,
                }}>→</div>
              </div>
              <div style={{ position: "relative", display: "grid", gap: 0 }}>
                <div style={{
                  position: "absolute",
                  left: 17,
                  top: 18,
                  bottom: 18,
                  width: 2,
                  background: "var(--rule-soft)",
                }} />
                {[
                  {
                    n: "1",
                    title: "Fill in your profile",
                    note: userProfile
                      ? [userProfile.homeAirport, userProfile.travelers ? `${userProfile.travelers} travelers` : null, userProfile.budget].filter(Boolean).join(" · ")
                      : "Airport, travelers, budget.",
                    state: userProfile ? "done" : "current",
                    action: () => setLoginOpen(true),
                    actionLabel: userProfile ? "Edit" : "Start",
                  },
                  {
                    n: "2",
                    title: "Tell Reiko your destination",
                    note: "Use the chat on the right.",
                    state: userProfile ? "current" : "upcoming",
                    arrow: userProfile,
                  },
                  {
                    n: "3",
                    title: "Reiko builds itinerary",
                    note: "Route, days, stops, restaurants.",
                    state: "upcoming",
                  },
                  {
                    n: "4",
                    title: "Review route + booking checklist",
                    note: "Approve, adjust, then book.",
                    state: "upcoming",
                  },
                ].map((step, index) => {
                  const current = step.state === "current";
                  const done = step.state === "done";
                  return (
                    <div key={step.title} style={{
                      position: "relative",
                      display: "grid",
                      gridTemplateColumns: "36px 1fr",
                      gap: 15,
                      paddingBottom: index === 3 ? 0 : 25,
                    }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        background: done ? "#34C759" : current ? "var(--ink)" : "var(--paper)",
                        border: current || done ? "none" : "1px solid var(--rule)",
                        color: current || done ? "var(--bg)" : "var(--muted)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: done ? 17 : 13,
                        fontWeight: 800,
                        zIndex: 1,
                        boxShadow: current ? "0 0 0 4px var(--accent-soft)" : "none",
                      }}>{done ? "✓" : step.n}</div>
                      <div style={{ minWidth: 0, paddingTop: 1 }}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 10,
                          marginBottom: 4,
                        }}>
                          <div style={{
                            fontSize: current ? 18 : 16,
                            fontWeight: current ? 800 : 700,
                            letterSpacing: "-0.02em",
                            color: step.state === "upcoming" ? "var(--ink-2)" : "var(--ink)",
                          }}>{step.title}</div>
                          {step.actionLabel && (
                            <button className="btn tag" style={{ padding: "6px 11px", fontSize: 12 }} onClick={step.action}>
                              {step.actionLabel}
                            </button>
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 13, lineHeight: 1.42 }}>
                          {step.note || "Ready."}
                        </div>
                        {step.arrow && (
                          <div style={{
                            marginTop: 10,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            color: "var(--ink)",
                            fontSize: 13,
                            fontWeight: 800,
                          }}>
                            <span>Go to chat</span>
                            <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>→</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}
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

      {savedTripsOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
          zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setSavedTripsOpen(false)}>
          <div style={{
            background: "white", borderRadius: 16, padding: "28px 32px",
            maxWidth: 480, width: "90%", maxHeight: "70vh", overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 className="serif" style={{ fontSize: 22, margin: 0 }}>Saved Trips</h2>
              <button className="btn tag" onClick={() => setSavedTripsOpen(false)}>Close</button>
            </div>
            {savedTripsBusy && <div className="muted" style={{ textAlign: "center", padding: 24 }}>Loading...</div>}
            {!savedTripsBusy && savedTrips.length === 0 && (
              <div className="muted" style={{ textAlign: "center", padding: 24 }}>
                No saved trips yet. Generate a trip and it will appear here.
              </div>
            )}
            {!savedTripsBusy && savedTrips.map((t) => (
              <div key={t.id} className="card" style={{
                padding: "16px 20px", marginBottom: 10, cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }} onClick={() => loadAndViewTrip(t.id)}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{t.dates}</div>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


window.DirectionB = DirectionB;
})();
