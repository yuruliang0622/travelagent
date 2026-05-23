// CityMap — neighborhood-level map. Switches city based on activeDay.
// Each day's stops are plotted on the city's local coordinate space.

// 600×400 viewBox per city. Neighborhood labels approximate position
// (no precise geography — readable, abstract).
const CITY_MAPS = {
  tokyo: {
    name: "Tokyo",
    neighborhoods: [
      { x: 100, y: 60, label: "WAKO" }, { x: 200, y: 56, label: "ITABASHI" },
      { x: 290, y: 56, label: "KITA" }, { x: 380, y: 60, label: "ADACHI" },
      { x: 480, y: 60, label: "KATSUSHIKA" },
      { x: 70, y: 110, label: "NISHITOKYO" }, { x: 160, y: 116, label: "NERIMA" },
      { x: 260, y: 116, label: "TOSHIMA" }, { x: 360, y: 116, label: "ARAKAWA" },
      { x: 460, y: 116, label: "KATSUSHIKA" }, { x: 540, y: 116, label: "ICHIKAWA" },
      { x: 60, y: 168, label: "HIGASHIKURUME" }, { x: 170, y: 174, label: "NAKANO" },
      { x: 260, y: 174, label: "BUNKYO" }, { x: 350, y: 174, label: "TAITO" },
      { x: 432, y: 174, label: "SUMIDA" }, { x: 520, y: 174, label: "EDOGAWA" },
      { x: 90, y: 224, label: "MUSASHINO" }, { x: 200, y: 224, label: "SUGINAMI" },
      { x: 300, y: 228, label: "SHINJUKU" }, { x: 390, y: 228, label: "CHIYODA" },
      { x: 472, y: 228, label: "KOTO" }, { x: 568, y: 228, label: "URAYASU" },
      { x: 70, y: 280, label: "MITAKA" }, { x: 200, y: 286, label: "SETAGAYA" },
      { x: 312, y: 286, label: "SHIBUYA" }, { x: 392, y: 286, label: "MINATO" },
      { x: 100, y: 340, label: "CHOFU" }, { x: 232, y: 342, label: "MEGURO" },
      { x: 348, y: 342, label: "SHINAGAWA" }, { x: 460, y: 332, label: "ODAIBA" },
    ],
    // Subtle road lines — soft polylines hinting at major axes (Yamanote loop-ish).
    roads: [
      "M70,60 L540,60 L568,170 L568,300", // top + east
      "M70,60 L60,300 L120,360",            // west
      "M180,90 L240,200 L300,260 L380,260 L460,250 L520,180 L460,90", // loop
      "M180,300 L460,300",                  // south
      "M310,90 L310,360",                    // vertical
    ],
  },
  hakone: {
    name: "Hakone",
    neighborhoods: [
      { x: 180, y: 80, label: "MIYANOSHITA" }, { x: 360, y: 84, label: "GORA" },
      { x: 480, y: 100, label: "SENGOKUHARA" },
      { x: 100, y: 140, label: "TONOSAWA" }, { x: 260, y: 160, label: "KOWAKUDANI" },
      { x: 420, y: 180, label: "OWAKUDANI" },
      { x: 130, y: 220, label: "HAKONE-YUMOTO" }, { x: 300, y: 240, label: "ASHINOKO" },
      { x: 510, y: 240, label: "TOGENDAI" },
      { x: 110, y: 300, label: "ODAWARA" }, { x: 320, y: 320, label: "MOTO-HAKONE" },
      { x: 520, y: 320, label: "LAKE ASHI" },
    ],
    roads: [
      "M110,300 L150,220 L260,160 L360,84",          // Hakone-Tozan rail
      "M360,84 L420,180 L300,240",                   // Ropeway path
      "M150,220 L300,240 L510,240 L520,320",         // Lake circuit
      "M260,160 L420,180",                            // crater road
    ],
  },
  kyoto: {
    name: "Kyoto",
    neighborhoods: [
      { x: 90, y: 60, label: "KIBUNE" }, { x: 270, y: 60, label: "KITAYAMA" },
      { x: 440, y: 60, label: "OHARA" },
      { x: 80, y: 120, label: "ARASHIYAMA" }, { x: 220, y: 124, label: "NISHIJIN" },
      { x: 360, y: 124, label: "DEMACHI" }, { x: 500, y: 124, label: "KURAMA" },
      { x: 130, y: 188, label: "SAGA" }, { x: 270, y: 192, label: "NIJO" },
      { x: 400, y: 192, label: "GION" }, { x: 510, y: 192, label: "HIGASHIYAMA" },
      { x: 110, y: 252, label: "KATSURA" }, { x: 240, y: 256, label: "DOWNTOWN" },
      { x: 360, y: 256, label: "KAWARAMACHI" }, { x: 490, y: 256, label: "KIYOMIZU" },
      { x: 140, y: 318, label: "TOJI" }, { x: 280, y: 322, label: "KYOTO STATION" },
      { x: 430, y: 322, label: "FUSHIMI" },
    ],
    roads: [
      "M280,322 L280,60",          // Karasuma N-S
      "M80,256 L500,256",          // Shijo E-W
      "M80,192 L500,192",          // Oike E-W
      "M280,322 L430,322 L490,256 L400,192", // to Fushimi & Higashiyama
      "M80,120 L130,188 L240,256", // Arashiyama line
    ],
  },
  osaka: {
    name: "Osaka",
    neighborhoods: [
      { x: 100, y: 60, label: "TOYONAKA" }, { x: 250, y: 60, label: "SUITA" },
      { x: 400, y: 60, label: "MORIGUCHI" }, { x: 520, y: 80, label: "KADOMA" },
      { x: 110, y: 130, label: "AMAGASAKI" }, { x: 240, y: 130, label: "UMEDA" },
      { x: 380, y: 130, label: "KYOBASHI" }, { x: 510, y: 150, label: "HIRANO" },
      { x: 110, y: 200, label: "KOBE-LINE" }, { x: 240, y: 200, label: "HONMACHI" },
      { x: 360, y: 200, label: "OSAKA CASTLE" }, { x: 500, y: 220, label: "TSURUHASHI" },
      { x: 130, y: 270, label: "NAMBA" }, { x: 260, y: 270, label: "SHINSAIBASHI" },
      { x: 380, y: 270, label: "DOTONBORI" }, { x: 510, y: 290, label: "TSURUMI" },
      { x: 160, y: 330, label: "TENNOJI" }, { x: 320, y: 330, label: "NIPPONBASHI" },
      { x: 470, y: 340, label: "ABENO" },
    ],
    roads: [
      "M240,60 L240,330",         // Midosuji N-S
      "M110,130 L510,150",        // east-west belt
      "M240,200 L360,200 L380,270", // castle to Dotonbori
      "M130,270 L380,270 L510,290", // south
      "M380,130 L500,220",        // east diagonal
    ],
  },
  kansai: {
    name: "Kansai",
    neighborhoods: [
      { x: 100, y: 80, label: "KYOTO" },
      { x: 230, y: 130, label: "TAKATSUKI" },
      { x: 340, y: 160, label: "IBARAKI" },
      { x: 220, y: 200, label: "OSAKA" },
      { x: 360, y: 220, label: "HIRAKATA" },
      { x: 130, y: 220, label: "AMAGASAKI" },
      { x: 240, y: 280, label: "NAMBA" },
      { x: 380, y: 290, label: "SAKAI" },
      { x: 500, y: 320, label: "KIX" },
      { x: 60, y: 280, label: "KOBE" },
    ],
    roads: [
      "M100,80 L230,130 L340,160 L500,320",  // Haruka express
      "M100,80 L130,220 L220,200 L240,280 L500,320",
      "M60,280 L240,280 L500,320",
    ],
  },
};

// Per-day stop coordinates in the city's viewBox.
// Indexed by day number → array matching trip.days[n-1].stops order.
const DAY_STOP_COORDS = {
  1: [ // Tokyo arrival
    { x: 540, y: 90,  city: "tokyo", label: "Narita NEX" },
    { x: 296, y: 250, city: "tokyo", label: "Park Hyatt" },
    { x: 304, y: 296, city: "tokyo", label: "Shibuya Crossing" },
    { x: 292, y: 244, city: "tokyo", label: "Omoide Yokocho" },
  ],
  2: [ // Tokyo Day 2
    { x: 396, y: 158, city: "tokyo", label: "Senso-ji" },
    { x: 372, y: 174, city: "tokyo", label: "Ueno soba" },
    { x: 472, y: 240, city: "tokyo", label: "teamLab Toyosu" },
    { x: 388, y: 200, city: "tokyo", label: "Akihabara" },
  ],
  3: [ // Hakone
    { x: 130, y: 220, city: "hakone", label: "Yumoto" },
    { x: 360, y: 84,  city: "hakone", label: "Open-Air Museum" },
    { x: 420, y: 180, city: "hakone", label: "Owakudani" },
    { x: 280, y: 200, city: "hakone", label: "Ryokan" },
  ],
  4: [ // Kyoto Day 4
    { x: 280, y: 322, city: "kyoto", label: "Kyoto Stn" },
    { x: 270, y: 240, city: "kyoto", label: "Nishiki Market" },
    { x: 490, y: 256, city: "kyoto", label: "Kiyomizu-dera" },
    { x: 400, y: 220, city: "kyoto", label: "Gion" },
  ],
  5: [ // Kyoto Day 5
    { x: 430, y: 322, city: "kyoto", label: "Fushimi Inari" },
    { x: 80, y: 156,  city: "kyoto", label: "Bamboo Grove" },
    { x: 120, y: 188, city: "kyoto", label: "Tenryu-ji" },
    { x: 360, y: 240, city: "kyoto", label: "Pontocho" },
  ],
  6: [ // Osaka
    { x: 240, y: 130, city: "osaka", label: "Umeda" },
    { x: 360, y: 200, city: "osaka", label: "Osaka Castle" },
    { x: 380, y: 270, city: "osaka", label: "Dotonbori" },
    { x: 240, y: 130, city: "osaka", label: "Umeda Sky" },
  ],
  7: [ // KIX departure
    { x: 100, y: 80,  city: "kansai", label: "Higashiyama coffee" },
    { x: 220, y: 200, city: "kansai", label: "Haruka express" },
    { x: 500, y: 320, city: "kansai", label: "KIX" },
  ],
};

function CityMap({ activeDay, days, setActiveDay }) {
  const isOverview = activeDay === 0 || !DAY_STOP_COORDS[activeDay];
  const coords = isOverview ? [] : (DAY_STOP_COORDS[activeDay] || []);
  const cityId = coords[0]?.city || "tokyo";
  const city = CITY_MAPS[cityId];
  const day = days.find((d) => d.n === activeDay);

  const [hoverIdx, setHoverIdx] = React.useState(null);

  // Overview pins — one anchor per day, plotted on a Honshu-ish layout.
  const OVERVIEW_PINS = [
    { x: 478, y: 200, label: "Tokyo · D1", day: 1 },
    { x: 478, y: 200, label: "Tokyo · D2", day: 2 },
    { x: 442, y: 224, label: "Hakone · D3", day: 3 },
    { x: 188, y: 270, label: "Kyoto · D4", day: 4 },
    { x: 188, y: 270, label: "Kyoto · D5", day: 5 },
    { x: 152, y: 296, label: "Osaka · D6", day: 6 },
    { x: 124, y: 312, label: "KIX · D7", day: 7 },
  ];

  // Group by location so D1+D2 stack as one badge, etc.
  const overviewGroups = React.useMemo(() => {
    if (!isOverview) return [];
    const m = new Map();
    OVERVIEW_PINS.forEach((p) => {
      const k = `${p.x},${p.y}`;
      if (!m.has(k)) m.set(k, { x: p.x, y: p.y, days: [], cityLabel: p.label.split(" · ")[0] });
      m.get(k).days.push(p.day);
    });
    return [...m.values()];
  }, [isOverview]);

  return (
    <svg
      viewBox="0 0 600 400"
      style={{ display: "block", width: "100%", height: "100%" }}
      aria-label={isOverview ? "Trip overview map" : `Day ${activeDay} map of ${city.name}`}
    >
      <defs>
        <radialGradient id="city-bg" cx="50%" cy="50%" r="80%">
          <stop offset="0%" stopColor="#F5F6FA" />
          <stop offset="100%" stopColor="#E8EAEF" />
        </radialGradient>
        <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Map background */}
      <rect width="600" height="400" fill="url(#city-bg)" />

      {isOverview ? (
        <OverviewLayer pins={overviewGroups} setActiveDay={setActiveDay} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
      ) : (
        <DetailLayer city={city} coords={coords} activeDay={activeDay} day={day} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
      )}
    </svg>
  );
}

// Honshu-ish backdrop showing all 4 cities as anchor pins.
function OverviewLayer({ pins, setActiveDay, hoverIdx, setHoverIdx }) {
  const HONSHU_PATH =
    "M540 130 C 560 150, 555 195, 530 210 C 500 225, 460 232, 420 240 C 365 255, 300 268, 240 280 C 190 290, 130 300, 95 318 C 75 330, 70 350, 80 355 C 90 360, 130 348, 175 332 C 240 312, 310 296, 360 282 C 410 268, 460 252, 500 232 C 525 218, 545 195, 540 130 Z";
  return (
    <g>
      {/* Honshu outline */}
      <path d={HONSHU_PATH} fill="#FFFFFF" stroke="#CFD3DA" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Subtle inland tones */}
      <path d={HONSHU_PATH} fill="none" stroke="#E0E2E8" strokeWidth="6" opacity="0.6" transform="scale(0.96) translate(12 6)" />

      {/* Region labels */}
      <g style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>
        <text x="455" y="172" textAnchor="middle" fill="#9CA0A8">KANTO</text>
        <text x="210" y="248" textAnchor="middle" fill="#9CA0A8">KANSAI</text>
        <text x="320" y="370" textAnchor="middle" fill="#C7CAD2">PACIFIC OCEAN</text>
        <text x="180" y="60" textAnchor="middle" fill="#C7CAD2">SEA OF JAPAN</text>
      </g>

      {/* Big background type */}
      <text x="300" y="60" textAnchor="middle" fill="#D8DAE0"
        style={{ fontFamily: "var(--serif)", fontSize: 64, fontWeight: 600, letterSpacing: "-0.04em" }}>
        Japan
      </text>

      {/* Route line connecting cities */}
      <polyline
        points={pins.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none" stroke="#A26FE8" strokeWidth="2" strokeDasharray="4 5" opacity="0.85" strokeLinecap="round"
      />

      {/* Pins */}
      {pins.map((p, i) => {
        const isHover = hoverIdx === i;
        const r = isHover ? 14 : 11;
        return (
          <g key={i} className="pin is-active" style={{ transformOrigin: `${p.x}px ${p.y}px`, cursor: "pointer" }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => setActiveDay && setActiveDay(p.days[0])}>
            <circle cx={p.x} cy={p.y} r={r + 8} fill="#A26FE8" opacity="0.18" />
            <circle cx={p.x} cy={p.y} r={r} fill="#A26FE8" stroke="#6F3FB9" strokeWidth="1.5" filter="url(#pin-shadow)" />
            <circle cx={p.x} cy={p.y} r={r - 4} fill="#FFFFFF" />
            <text x={p.x} y={p.y + 3} textAnchor="middle"
              style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, fill: "#6F3FB9" }}>
              {p.days.join("·")}
            </text>
            {/* City label */}
            <text x={p.x} y={p.y + 26} textAnchor="middle"
              style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, fill: "#1D1D1F" }}>
              {p.cityLabel}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// Detail city map (existing behavior).
function DetailLayer({ city, coords, activeDay, day, hoverIdx, setHoverIdx }) {
  return (
    <g>
      {/* Subtle road lines */}
      <g stroke="#FFFFFF" strokeWidth="6" fill="none" opacity="0.85" strokeLinecap="round" strokeLinejoin="round">
        {city.roads.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g stroke="#CFD3DA" strokeWidth="0.8" fill="none" opacity="0.9" strokeLinecap="round" strokeLinejoin="round">
        {city.roads.map((d, i) => <path key={i} d={d} />)}
      </g>

      {/* Faint grid */}
      <g opacity="0.25">
        {[...Array(8)].map((_, i) => (
          <line key={`v${i}`} x1={i * 80} y1="0" x2={i * 80} y2="400" stroke="#C4C8CF" strokeWidth="0.4" />
        ))}
        {[...Array(6)].map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 70} x2="600" y2={i * 70} stroke="#C4C8CF" strokeWidth="0.4" />
        ))}
      </g>

      {/* City title in big faint type */}
      <text
        x="300" y="60" textAnchor="middle"
        fill="#D2D5DC"
        style={{ fontFamily: "var(--serif)", fontSize: 80, fontWeight: 600, letterSpacing: "-0.04em" }}
      >
        {city.name}
      </text>

      {/* Neighborhood labels */}
      <g style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>
        {city.neighborhoods.map((n) => (
          <text key={n.label} x={n.x} y={n.y} textAnchor="middle" fill="#9CA0A8">{n.label}</text>
        ))}
      </g>

      {/* Route polyline */}
      {coords.length > 1 && (
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none" stroke="#A26FE8" strokeWidth="2" strokeDasharray="4 5" opacity="0.85" strokeLinecap="round"
        />
      )}

      {/* Pins */}
      {coords.map((c, i) => {
        const isHover = hoverIdx === i;
        const r = isHover ? 14 : 11;
        return (
          <g key={i} className="pin is-active" style={{ transformOrigin: `${c.x}px ${c.y}px`, cursor: "pointer" }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}>
            <circle cx={c.x} cy={c.y} r={r + 8} fill="#A26FE8" opacity="0.18" />
            <circle cx={c.x} cy={c.y} r={r} fill="#A26FE8" stroke="#6F3FB9" strokeWidth="1.5" filter="url(#pin-shadow)" />
            <circle cx={c.x} cy={c.y} r={r - 4} fill="#FFFFFF" />
            <text x={c.x} y={c.y + 3} textAnchor="middle"
              style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, fill: "#6F3FB9" }}>
              {i + 1}
            </text>
            {isHover && (
              <g>
                <rect x={c.x - 60} y={c.y - 42} width="120" height="22" rx="6" fill="#1D1D1F" />
                <text x={c.x} y={c.y - 27} textAnchor="middle"
                  style={{ fontFamily: "var(--sans)", fontSize: 10, fontWeight: 600, fill: "#FFF" }}>
                  {c.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Day badge bottom-right */}
      <g transform="translate(528, 364)">
        <rect x="-50" y="-18" width="100" height="32" rx="16" fill="#FFFFFF" stroke="#E0E2E8" />
        <text x="0" y="2" textAnchor="middle"
          style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, fill: "#86868B", letterSpacing: "0.08em" }}>
          DAY {String(activeDay).padStart(2, "0")}
        </text>
        <text x="0" y="13" textAnchor="middle"
          style={{ fontFamily: "var(--sans)", fontSize: 9, fill: "#86868B" }}>
          {day?.title}
        </text>
      </g>
    </g>
  );
}

window.CityMap = CityMap;
