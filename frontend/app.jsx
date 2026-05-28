(function () {
// Main app — wait until Babel-loaded components and #root are ready.

function App() {
  return <window.DirectionB />;
}

function mountApp() {
  const root = document.getElementById("root");
  if (!root || !window.DirectionB) {
    window.setTimeout(mountApp, 30);
    return;
  }
  ReactDOM.createRoot(root).render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp, { once: true });
} else {
  mountApp();
}
})();
