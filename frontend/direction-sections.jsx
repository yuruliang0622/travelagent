(function () {
// DirectionB presentational sections. These are UI-only components.

const { splitProfileList } = window.TripProfile;
const { splitSummaryLines, simplePackingCategory, simplePackingItem } = window.TripNormalizers;

function BookingSuggestions({ trip, userProfile }) {
  const selectedFlight = userProfile?.selectedFlight;
  const selectedHotels = userProfile?.selectedHotels || [];

  if (!selectedFlight && !selectedHotels.length) return null;
  const cards = [
    ...(selectedFlight ? [flightCardFromSelection(selectedFlight)] : []),
    ...selectedHotels.map((hotel) => hotelCardFromSelection(hotel, trip)),
  ].slice(0, 6);

  return (
    <section style={{ padding: "0 40px 44px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, gap: 16 }}>
        <h2 className="serif" style={{ fontSize: 34, letterSpacing: "-0.035em" }}>Flights + hotels</h2>
        <div className="muted" style={{ fontSize: 13 }}>Selected in chat</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {cards.map((item) => (
          <a key={item.id} href={item.handoff_url} target="_blank" rel="noreferrer" className="card-lg" style={{ padding: 18, display: "grid", gap: 10 }}>
            <div className="mono muted">{item.type === "flight" ? "FLIGHT" : "HOTEL"}</div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{item.title}</div>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>{item.provider} · {item.deadline}</div>
            <span className="btn tag" style={{ width: "fit-content", padding: "7px 12px" }}>{item.action_label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function hotelCardFromSelection(hotel, trip) {
  const price = hotel.price_per_night_usd ? `$${Number(hotel.price_per_night_usd).toLocaleString()}/night` : "Live rate";
  const rating = hotel.rating ? `${Number(hotel.rating).toFixed(1)} rating` : "Rating available";
  const stay = hotelStayLabel(hotel, trip);
  return {
    id: `selected-hotel-${hotel.city || hotel.area || "city"}-${hotel.id || hotel.name}`,
    type: "hotel",
    title: `${hotel.city || hotel.area || "Hotel"} · ${hotel.name}`,
    provider: [stay, price, rating].filter(Boolean).join(" · "),
    deadline: hotel.area || "Confirmed hotel",
    action_label: "Open map",
    handoff_url: googleMapsHotelUrl(hotel),
  };
}

function hotelStayLabel(hotel, trip) {
  const city = String(hotel.city || hotel.area || "").toLowerCase();
  const matchingDays = (trip.days || [])
    .filter((day) => {
      const region = majorRegionForDay(day).toLowerCase();
      return city.includes(region) || region.includes(city.split(",")[0].trim());
    })
    .map((day) => day.n);
  const nights = Number(hotel.nights || 0);
  const days = nights > 0 ? matchingDays.slice(0, nights) : matchingDays;
  const range = compactDayRange(days);
  const nightsLabel = nights ? `${nights} night${nights === 1 ? "" : "s"}` : "Selected stay";
  return [range, nightsLabel].filter(Boolean).join(" · ");
}

function compactDayRange(days) {
  if (!days.length) return "";
  if (days.length === 1) return `Day ${days[0]}`;
  return `Day ${days[0]}-${days[days.length - 1]}`;
}

function googleMapsHotelUrl(hotel) {
  const query = [hotel.name, hotel.area || hotel.city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function flightCardFromSelection(flight) {
  const route = `${flight.origin || "SFO"}-${flight.destination || "NRT"}`;
  const times = [compactFlightTime(flight.depart_time), compactFlightTime(flight.arrive_time)].filter(Boolean).join(" -> ");
  const price = flight.price_usd ? `$${flight.price_usd}` : "Live price";
  const stops = flight.stops === 0 ? "Nonstop" : `${flight.stops || 1} stop`;
  return {
    id: `selected-flight-${flight.id || flight.airline || route}`,
    type: "flight",
    title: `${flight.airline || "Selected flight"} · ${route}`,
    provider: [times, flight.duration, stops, price].filter(Boolean).join(" · "),
    deadline: "Selected in chat",
    action_label: "Review flight",
    handoff_url: flight.booking_url || flight.deep_link || "https://www.google.com/travel/flights",
  };
}

function compactFlightTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : text;
}


function PackingList({ trip }) {
  const itemCount = trip.packing.reduce((a, p) => a + p.items.length, 0);

  return (
    <section style={{ padding: "0 40px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <h2 className="serif" style={{ fontSize: 40, letterSpacing: "-0.035em" }}>Packing</h2>
        <div className="muted" style={{ fontSize: 14 }}>{itemCount} items</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {trip.packing.map((p) => {
          const cat = simplePackingCategory(p.cat);
          const catIcon = { Docs: "Bag", Wear: "Sun", Kit: "Compass", Cash: "Camera", Pack: "Bag", Before: "Bag", "On trip": "Compass" }[cat] || "Bag";
          const I = window.Ic[catIcon];
          return (
            <div key={p.cat} className="card-lg" style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)" }}><I /></span>
                  <h3 className="serif" style={{ fontSize: 20, letterSpacing: "-0.015em" }}>{cat}</h3>
                </div>
                <span className="muted" style={{ fontSize: 13 }}>{p.items.length}</span>
              </div>
              <ul style={{ display: "grid", gap: 10 }}>
                {p.items.map((it) => (
                  <li key={it} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--rule)", flex: "0 0 16px", transform: "translateY(2px)" }} />
                    <span style={{ fontSize: 14, lineHeight: 1.45 }}>{simplePackingItem(it)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryCards({ summary }) {
  const [manualChecked, setManualChecked] = React.useState({});

  function toggle(city) {
    setManualChecked(prev => ({ ...prev, [city]: !prev[city] }));
  }

  function isChecked(city, booked) {
    return !!manualChecked[city] || (booked || []).some(b => b.toLowerCase() === city.toLowerCase());
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto 32px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {summary.map((s) => (
        <div key={s.label} className="card-lg" style={{ padding: 18 }}>
          <div className="muted" style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: "0.08em", marginBottom: 12 }}>
            {s.label.toUpperCase()}
          </div>
          {s.checklist ? (
            <div style={{ display: "grid", gap: 10 }}>
              {s.checklist.map((city) => {
                const checked = isChecked(city, s.booked);
                return (
                <div
                  key={city}
                  onClick={() => toggle(city)}
                  style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 4,
                    border: "1.5px solid var(--rule)", flex: "0 0 18px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: checked ? "var(--accent)" : "transparent",
                    color: "#fff", fontSize: 11, fontWeight: 700,
                    transition: "background 0.15s",
                  }}>
                    {checked ? "✓" : ""}
                  </span>
                  <span style={{
                    fontSize: 14, lineHeight: 1.4,
                    textDecoration: checked ? "line-through" : "none",
                    color: checked ? "var(--ink-2)" : "var(--ink)",
                  }}>{city}</span>
                </div>
                );
              })}
            </div>
          ) : s.connections ? (
            <div style={{ display: "grid", gap: 12 }}>
              {s.connections.map((c, i) => (
                <div key={i}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                    {c.from} → {c.to}
                  </div>
                  {c.note && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>{c.note}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {s.lines.map(([title, sub], i) => (
                <div key={i}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function majorRegionForDay(day) {
  return window.TripNormalizers?.majorRegionForDay?.(day) || day.city || "Route";
}

function dayKeywords(day) {
  const stops = day.stops || [];
  const categories = [...new Set(stops.map((s) => String(s.category || "").toLowerCase()).filter(Boolean))];
  if (categories.length) return categories.slice(0, 3).map((c) => c[0].toUpperCase() + c.slice(1)).join(" · ");
  const text = stops.map((s) => s.k).join(" ").toLowerCase();
  const words = [];
  if (/airport|flight|narita|haneda|kix/.test(text)) words.push("Arrival");
  if (/temple|shrine|senso|fushimi|kiyomizu/.test(text)) words.push("Temples");
  if (/castle|museum|history/.test(text)) words.push("History");
  if (/market|food|dinner|lunch|izakaya|soba|dotonbori/.test(text)) words.push("Food");
  if (/onsen|ryokan|hakone|fuji|ropeway/.test(text)) words.push("Nature");
  return words.slice(0, 3).join(" · ") || "Highlights";
}

function dayCoreExperience(day) {
  const stops = (day.stops || []).filter((s) => !/flight home|check-in/i.test(s.k));
  const names = stops.map((s) => s.k.replace(/^(Lunch|Dinner|Coffee|Check-in)\s*·\s*/i, "").trim());
  return names.slice(0, 2).join(" + ") || day.title;
}

function MemoryProof({ userProfile, trip, planningStatus }) {
  const savedName = userProfile?.name || "Traveler";
  const stable = [
    userProfile?.homeAirport ? `Home airport: ${userProfile.homeAirport}` : "Home airport ready",
    userProfile?.travelers ? `${userProfile.travelers} traveler default` : "Traveler count ready",
    userProfile?.budget ? `Budget: ${userProfile.budget}` : "Budget memory ready",
  ];

  return (
    <section style={{ padding: "0 40px 28px" }}>
      <div className="card-lg" style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: 18,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "center",
      }}>
        <div>
          <div className="mono accent" style={{ marginBottom: 8 }}>MONGODB MEMORY + AGENT TOOLS</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>
            Reiko remembers {savedName} and saves approved trips.
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
            Profile memory, generated itinerary, and saved-trip history are persisted through the backend MongoDB layer for the hackathon partner track.
          </div>
        </div>
        <div style={{ display: "grid", gap: 7, minWidth: 210 }}>
          {["Profile memory", "Saved trip", "Atlas Vector Search"].map((label, index) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
              <span className="muted">{label}</span>
              <strong>{index === 1 && planningStatus?.state === "loading" ? "Saving" : "Ready"}</strong>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11, lineHeight: 1.35, marginTop: 2 }}>
            {stable.filter(Boolean).slice(0, 3).join(" · ")}
          </div>
        </div>
      </div>
    </section>
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

function LoginSheet({ userProfile, planningStatus, onSave, onClear, onClose }) {
  const [name, setName] = React.useState(userProfile?.name || "");
  const [email, setEmail] = React.useState(userProfile?.email || "");
  const [homeAirport, setHomeAirport] = React.useState(userProfile?.homeAirport || userProfile?.home_airport || "");
  const [travelers, setTravelers] = React.useState(userProfile?.travelers || 2);
  const [budget, setBudget] = React.useState(userProfile?.budget || "Moderate");
  const [pace, setPace] = React.useState(userProfile?.pace || "balanced");
  const [foodPreferences, setFoodPreferences] = React.useState(
    userProfile?.foodPreferences?.join(", ") || userProfile?.food_preferences?.join(", ") || ""
  );
  const [memoryConsent, setMemoryConsent] = React.useState(userProfile?.memoryConsent ?? true);

  function submit(e) {
    e.preventDefault();
    const nextProfile = {
      ...(userProfile || {}),
      id: userProfile?.id || "primary",
      name: name.trim() || "Traveler",
      email: email.trim(),
      homeAirport: homeAirport.trim(),
      passportCountry: userProfile?.passportCountry || "United States",
      travelers: Math.max(1, Number(travelers) || 1),
      pace,
      budget,
      foodPreferences: splitProfileList(foodPreferences),
      memoryConsent,
      completed: true,
      profileSetupComplete: true,
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
        top: 0,
        left: 0,
        /* Stop 380px from the right so the AgentChat panel stays visible */
        right: 380,
        bottom: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.26)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "calc(100vh - 40px)",
          overflow: "auto",
          background: "var(--paper)",
          color: "var(--ink)",
          borderRadius: 22,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--rule-soft)",
          padding: 22,
          display: "grid",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <div>
            <div className="mono accent" style={{ marginBottom: 8 }}>TRAVELER PROFILE</div>
            <h2 className="serif" style={{ fontSize: 28, lineHeight: 1.05, margin: 0 }}>
              Set up your travel memory.
            </h2>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 8, maxWidth: 520 }}>
              I’ll save stable preferences only. Destination, hotels, and trip style are asked fresh for each trip.
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

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
          <ProfileField label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={profileInputStyle} />
          </ProfileField>
          <ProfileField label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" style={profileInputStyle} />
          </ProfileField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 0.55fr)", gap: 12 }}>
          <ProfileField label="Home airport">
            <input value={homeAirport} onChange={(e) => setHomeAirport(e.target.value)} placeholder="SFO" style={profileInputStyle} />
          </ProfileField>
          <ProfileField label="Default travelers">
            <input value={travelers} onChange={(e) => setTravelers(e.target.value)} min="1" max="20" type="number" style={profileInputStyle} />
          </ProfileField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
          <ProfileField label="Budget style">
            <select value={budget} onChange={(e) => setBudget(e.target.value)} style={profileInputStyle}>
              <option>Budget-friendly</option>
              <option>Moderate</option>
              <option>Comfortable</option>
              <option>Luxury</option>
            </select>
          </ProfileField>
          <ProfileField label="Pace preference">
            <select value={pace} onChange={(e) => setPace(e.target.value)} style={profileInputStyle}>
              <option value="relaxed">Relaxed</option>
              <option value="balanced">Balanced</option>
              <option value="packed">Packed</option>
            </select>
          </ProfileField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
          <ProfileField label="Food restrictions">
            <input value={foodPreferences} onChange={(e) => setFoodPreferences(e.target.value)} placeholder="No seafood, vegetarian" style={profileInputStyle} />
          </ProfileField>
        </div>

        <label style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          background: "var(--paper-2)",
          borderRadius: 14,
          padding: 12,
          color: "var(--ink-2)",
          fontSize: 13,
          lineHeight: 1.45,
        }}>
          <input
            checked={memoryConsent}
            onChange={(e) => setMemoryConsent(e.target.checked)}
            type="checkbox"
            style={{ marginTop: 3 }}
          />
          Let Trip Agent remember these stable preferences for future trip planning.
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
            disabled={planningStatus?.state === "loading"}
            style={{
              padding: "10px 18px",
              fontSize: 13,
            }}
          >
            {planningStatus?.state === "loading" ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileField({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 650, color: "var(--ink-2)" }}>
      {label}
      {children}
    </label>
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
function OverviewList({ trip, setActiveDay, userProfile, planningStatus }) {
  const summarySource = trip.summary || {};
  const selectedFlight = userProfile?.selectedFlight;
  const flightSummary = selectedFlight
    ? selectedFlightSummaryLines(selectedFlight)
    : splitSummaryLines(summarySource.flights || "Prepare flight search · Verify airport timing");
  const hotelCities = [...new Set(trip.days.map(d => majorRegionForDay(d)))];
  const bookedCities = (userProfile?.selectedHotels || []).map(h => h.city || h.area || '').filter(Boolean);
  // Build inter-city transit connections from day-to-day city changes
  const connections = [];
  let prevCity = null;
  for (const day of trip.days) {
    const city = majorRegionForDay(day);
    if (prevCity && city !== prevCity) {
      // Collect transit notes from this day's stops
      const transitNotes = (day.stops || [])
        .map(s => s.note)
        .filter(n => n && /\b(train|station|Shinkansen|bus|line|transfer|express|limited|local|rapid|bullet|Hikari|Nozomi|Kodama|JR|Odakyu|Romancecar|Haruka|Narita|Keisei|Tokaido|Sanyo|subway|metro|monorail|tram|cable|ropeway|ferry)\b/i.test(n));
      connections.push({ from: prevCity, to: city, note: transitNotes[0] || "" });
    }
    prevCity = city;
  }
  // Budget: sum flights + hotels in USD
  const flightPrice = selectedFlight?.price_usd || 0;
  const hotelTotal = (userProfile?.selectedHotels || []).reduce((sum, h) => {
    return sum + (h.total_estimate_usd || (h.price_per_night_usd || 0) * (h.nights || 1) || 0);
  }, 0);
  let budgetLines;
  if (flightPrice || hotelTotal) {
    budgetLines = [];
    if (flightPrice) budgetLines.push(["Flights", `$${flightPrice.toLocaleString()}`]);
    if (hotelTotal) budgetLines.push(["Hotels", `$${hotelTotal.toLocaleString()}`]);
    budgetLines.push(["Total", `~$${(flightPrice + hotelTotal).toLocaleString()} USD`]);
  } else {
    budgetLines = splitSummaryLines(summarySource.budget || "Use local currency · Verify exchange rate");
  }
  const summary = [
    { label: "Lodging", checklist: hotelCities, booked: bookedCities },
    { label: "Flights", lines: flightSummary },
    { label: "Transit", connections },
    { label: "Budget", lines: budgetLines },
  ];

  const cityColors = { Tokyo: "#FDB94E", Hakone: "#34C759", Kyoto: "#A26FE8", Nara: "#5B7C99", Osaka: "#FF6B6B", Kansai: "#5B7C99" };

  return (
    <div>
      {/* Centered title section */}
      <div style={{ textAlign: "center", maxWidth: 760, margin: "0 auto 32px" }}>
        <h2 className="serif" style={{ fontSize: 42, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
          {trip.destinationLabel} · {trip.days.length} Days
        </h2>
        <div className="muted" style={{ fontSize: 14, marginTop: 8 }}>
          {trip.dates} · {trip.travelers} travelers
        </div>
      </div>

      <SummaryCards summary={summary} />

      {/* Trip overview header */}
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 4px 12px" }}>
        <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Route overview</h3>
      </div>

      {/* Compact day table */}
      <div className="card-lg" style={{ maxWidth: 920, margin: "0 auto", padding: "4px 20px", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 160px 1fr 140px", gap: 20, padding: "14px 0", borderBottom: "1px solid var(--rule-soft)" }}>
          {["Day", "Major city", "Core experience", "Keywords"].map((label) => (
            <div key={label} className="muted" style={{ fontSize: 12, fontWeight: 650 }}>{label}</div>
          ))}
        </div>
        {trip.days.map((d) => {
          const region = majorRegionForDay(d);
          const dot = cityColors[region] || "#86868B";
          return (
            <button
              key={d.n}
              onClick={() => setActiveDay(d.n)}
              className="daycard"
              style={{
                width: "100%",
                padding: "16px 0",
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "80px 160px 1fr 140px",
                gap: 20,
                alignItems: "start",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--rule-soft)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flex: "0 0 9px" }} />
                <strong>Day {d.n}</strong>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{region}</div>
              <div className="ink2" style={{ fontSize: 14, lineHeight: 1.4 }}>{dayCoreExperience(d)}</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>{dayKeywords(d)}</div>
            </button>
          );
        })}
      </div>

      <div className="muted" style={{ maxWidth: 920, margin: "14px auto 0", fontSize: 13, lineHeight: 1.45 }}>
        Stay: {majorRouteSummary(trip)} · {trip.travelers} travelers
      </div>
    </div>
  );
}

function majorRouteSummary(trip) {
  const regions = [];
  (trip.days || []).forEach((day) => {
    const region = majorRegionForDay(day);
    if (region && regions[regions.length - 1] !== region) regions.push(region);
  });
  return regions.join(" -> ") || trip.routeLabel || trip.destinationLabel;
}

function selectedFlightSummaryLines(flight) {
  const route = `${flight.origin || "SFO"} -> ${flight.destination || "NRT"}`;
  const time = [compactFlightTime(flight.depart_time), compactFlightTime(flight.arrive_time)].filter(Boolean).join(" -> ");
  const price = flight.price_usd ? `$${flight.price_usd}` : "Live price";
  return [
    [`${flight.airline || "Selected flight"}`, route],
    [time || flight.duration || "Timing selected", `${flight.duration || ""}${flight.duration ? " · " : ""}${price}`],
  ];
}

Object.assign(window, {
  BookingSuggestions,
  PackingList,
  SummaryCards,
  MemoryProof,
  UserProfileMenu,
  LoginSheet,
  ProfileField,
  OverviewList,
});
})();
