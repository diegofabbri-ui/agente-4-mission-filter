// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import ReactGA from "react-ga4";

import App from "./App";
import "./index.css";

// --------------------- SENTRY FRONTEND ------------------
Sentry.init({
  // DSN dal tuo .env frontend
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_BUILD_VERSION || "unknown",

  sendDefaultPii: true,

  // ✅ naming aggiornato come da docs Sentry
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    // ✅ nuova API: niente "new", si usa replayIntegration(...)
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

// Debug: controlliamo che il DSN arrivi davvero
console.log("SENTRY FRONTEND DSN =", import.meta.env.VITE_SENTRY_DSN);

// Wrappiamo App con profiler Sentry
const SentryApp = Sentry.withProfiler(App);

// --------------------- GA4 (Google Analytics 4) ---------
const gaId = import.meta.env.VITE_GA4_ID;

if (gaId) {
  ReactGA.initialize(gaId);
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
}

// --------------------- RENDER APP -----------------------
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="p-6 text-red-600">
          Si è verificato un errore inatteso. Il team è stato notificato.
        </div>
      }
    >
      <SentryApp />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);



