(function () {
// Reiko avatar — inline SVG component. Lightweight, no external assets.
function ReikoAvatar({ size = 48, style = {} }) {
  const s = size;
  return React.createElement(
    "svg",
    {
      width: s,
      height: s,
      viewBox: "0 0 120 120",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      style: { borderRadius: "50%", overflow: "hidden", ...style },
    },
    // Background circle — warm gradient
    React.createElement("defs", null,
      React.createElement("linearGradient", { id: "reiko-bg", x1: 0, y1: 0, x2: 1, y2: 1 },
        React.createElement("stop", { offset: "0%", stopColor: "#F5E6D3" }),
        React.createElement("stop", { offset: "100%", stopColor: "#E8D5B7" })
      )
    ),
    React.createElement("circle", { cx: 60, cy: 60, r: 60, fill: "url(#reiko-bg)" }),

    // Hair — dark brown, bob style
    React.createElement("path", {
      d: "M30 58C30 30 90 30 90 58C90 62 88 68 86 72L82 78C80 82 78 84 76 86L74 88C72 90 68 92 66 94H54C52 92 48 90 46 88L44 86C42 84 40 82 38 78L34 72C32 68 30 62 30 58Z",
      fill: "#4A3728",
    }),
    // Side hair flares
    React.createElement("path", {
      d: "M30 58C28 70 32 82 34 78C36 74 34 66 34 60M90 58C92 70 88 82 86 78C84 74 86 66 86 60",
      stroke: "#4A3728", strokeWidth: 3, fill: "none", strokeLinecap: "round",
    }),

    // Face — warm skin tone
    React.createElement("ellipse", { cx: 60, cy: 66, rx: 25, ry: 26, fill: "#FDDCB5" }),

    // Eyes — friendly, slightly curved
    React.createElement("path", {
      d: "M48 62C48 62 52 64 54 62M66 62C66 62 68 64 72 62",
      stroke: "#2C1810", strokeWidth: 2.2, fill: "none",
      strokeLinecap: "round", strokeLinejoin: "round",
    }),
    // Eye shine
    React.createElement("circle", { cx: 51, cy: 60, r: 2.5, fill: "#2C1810" }),
    React.createElement("circle", { cx: 69, cy: 60, r: 2.5, fill: "#2C1810" }),
    // Eye highlights
    React.createElement("circle", { cx: 52, cy: 59, r: 0.9, fill: "white" }),
    React.createElement("circle", { cx: 70, cy: 59, r: 0.9, fill: "white" }),

    // Blush
    React.createElement("ellipse", { cx: 42, cy: 70, rx: 6, ry: 3.5, fill: "#F8C4B4", opacity: 0.55 }),
    React.createElement("ellipse", { cx: 78, cy: 70, rx: 6, ry: 3.5, fill: "#F8C4B4", opacity: 0.55 }),

    // Nose — tiny
    React.createElement("path", {
      d: "M59 65L60 67L61 65",
      stroke: "#D4A574", strokeWidth: 1.2, fill: "none",
      strokeLinecap: "round", strokeLinejoin: "round",
    }),

    // Mouth — gentle smile
    React.createElement("path", {
      d: "M54 73C56 75 64 75 66 73",
      stroke: "#C97D60", strokeWidth: 1.8, fill: "none",
      strokeLinecap: "round",
    }),

    // Collar / shirt
    React.createElement("path", {
      d: "M38 90L60 98L82 90",
      fill: "#5B8C85",
      stroke: "#4A7A73", strokeWidth: 0.8,
    }),
    // Collar inner
    React.createElement("path", {
      d: "M48 93L60 98L72 93",
      fill: "#6DA89E",
    }),

    // Small pin/badge on collar — a tiny torii or star
    React.createElement("circle", { cx: 56, cy: 92, r: 2.8, fill: "#D4A853" }),
    React.createElement("path", {
      d: "M54.5 91.5H57.5M56 90V93",
      stroke: "white", strokeWidth: 1, strokeLinecap: "round",
    }),
  );
}

window.ReikoAvatar = ReikoAvatar;
})();
