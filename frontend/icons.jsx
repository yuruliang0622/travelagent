// Simple monoline icons — 24×24, stroke-only.
const Ic = {
  Plane: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 12l18-7-3 18-6-7-9-4z" />
      <path d="M12 16l3-3" />
    </svg>
  ),
  Train: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M5 11h14" />
      <circle cx="9" cy="14" r="0.8" fill="currentColor" />
      <circle cx="15" cy="14" r="0.8" fill="currentColor" />
      <path d="M7 21l2-3M17 21l-2-3" />
    </svg>
  ),
  Temple: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 8l9-4 9 4" />
      <path d="M5 8v2h14V8" />
      <path d="M6 10v9M18 10v9M12 10v9" />
      <path d="M4 19h16" />
    </svg>
  ),
  Food: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 11c0-4 3.5-7 8-7s8 3 8 7" />
      <path d="M3 11h18" />
      <path d="M5 14l-1 6h16l-1-6" />
    </svg>
  ),
  Hotel: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 20V8l9-5 9 5v12" />
      <rect x="9" y="12" width="6" height="8" />
      <path d="M3 20h18" />
    </svg>
  ),
  Onsen: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 3c1 2-1 3 0 5M12 3c1 2-1 3 0 5M16 3c1 2-1 3 0 5" />
      <path d="M3 12h18" />
      <path d="M5 12c0 5 3 8 7 8s7-3 7-8" />
    </svg>
  ),
  Camera: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Walk: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="13" cy="4" r="1.5" />
      <path d="M9 21l3-7-3-3 2-5 4 4 3 1" />
      <path d="M6 14l3-3" />
    </svg>
  ),
  Compass: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8l-2 6-6 2 2-6 6-2z" />
    </svg>
  ),
  Sun: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  Bag: (p = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="5" y="7" width="14" height="14" rx="2" />
      <path d="M9 7V5a3 3 0 016 0v2" />
    </svg>
  ),
  Check: (p = {}) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  ),
  Arrow: (p = {}) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
};

// Categorize a stop description by keyword.
function iconForStop(text) {
  const s = text.toLowerCase();
  if (/(narita|haruka|express|train|shinkansen|romancecar|bullet|line|tokaido|jr )/.test(s)) return "Train";
  if (/(flight|airport|kix)/.test(s)) return "Plane";
  if (/(temple|shrine|inari|teramachi|tenryu|kiyomizu|senso|castle)/.test(s)) return "Temple";
  if (/(lunch|dinner|market|food|izakaya|ramen|coffee|crawl|yudofu)/.test(s)) return "Food";
  if (/(check-in|hotel|ryokan|hyatt)/.test(s)) return "Hotel";
  if (/(onsen|kaiseki|soak)/.test(s)) return "Onsen";
  if (/(sunset|sunrise|golden|sky building|observation|view|ropeway|museum|maiko|crossing|grove|bamboo|grounds|planets|arcade|alley|park)/.test(s)) return "Camera";
  return "Walk";
}

window.Ic = Ic;
window.iconForStop = iconForStop;
