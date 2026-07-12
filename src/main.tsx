import { createRoot } from "react-dom/client";
import { inject } from "@vercel/analytics";
import App from "./app/App";
import "./styles/index.css";

// Privacy-light page-view analytics (Vercel Web Analytics, no cookies).
// - PROD guard: dev sessions never emit events.
// - Capacitor guard: the Android webview has no /_vercel/insights endpoint, so
//   injecting there would only 404; the native bridge defines window.Capacitor.
// - Off Vercel, the script simply fails to load (single console.log, no errors).
// The injected script auto-tracks SPA route changes via history.pushState.
if (import.meta.env.PROD && !("Capacitor" in window)) {
  inject({ mode: "production" });
}

createRoot(document.getElementById("root")!).render(<App />);
