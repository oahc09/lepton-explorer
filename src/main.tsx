import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/win11.css";

// Persist frontend (WebView) exceptions to the same crash-log folder the
// native side writes to, so JS errors are not lost in the release build.
function reportError(kind: string, detail: unknown) {
  let msg: string;
  if (detail instanceof Error) {
    msg = `${detail.name}: ${detail.message}\n${detail.stack ?? ""}`;
  } else {
    try {
      msg = JSON.stringify(detail);
    } catch {
      msg = String(detail);
    }
  }
  // Dynamic import: never block startup, and stay safe if the API isn't ready.
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("log_frontend_error", { msg: `[${kind}] ${msg}` }))
    .catch(() => {});
}

window.addEventListener("error", (e) => {
  reportError("error", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  reportError("unhandledrejection", e.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
