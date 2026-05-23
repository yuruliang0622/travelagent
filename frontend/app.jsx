// Main app — Direction B rendered full-page with palette tweak.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "default"
}/*EDITMODE-END*/;

const PALETTE_OPTIONS = [
  { id: "default", label: "Graphite", swatch: ["#F5F5F7", "#1D1D1F", "#424245"] },
  { id: "sage",    label: "Sage",     swatch: ["#EFF2EC", "#1C231A", "#3F7A2A"] },
  { id: "slate",   label: "Slate",    swatch: ["#ECEEF2", "#131722", "#2A5BA0"] },
  { id: "ink",     label: "Dark",     swatch: ["#000000", "#F5F5F7", "#86868B"] },
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-palette", t.palette === "default" ? "" : t.palette);
  }, [t.palette]);

  return (
    <React.Fragment>
      <DirectionB />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Palette">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PALETTE_OPTIONS.map((p) => {
              const active = t.palette === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setTweak("palette", p.id)}
                  style={{
                    display: "flex", flexDirection: "column", gap: 8,
                    padding: 10, border: "1px solid " + (active ? "#111" : "rgba(0,0,0,0.12)"),
                    background: active ? "#f5f5f5" : "#fff", borderRadius: 8, cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", gap: 4 }}>
                    {p.swatch.map((c, i) => (
                      <div key={i} style={{
                        width: 22, height: 22, borderRadius: 4, background: c,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                </button>
              );
            })}
          </div>
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
