// src/instrument.ts
import "dotenv/config";
import * as Sentry from "@sentry/node";

// Leggiamo la DSN dal .env (puoi usare uno dei due nomi)
const dsn = process.env.SENTRY_DSN_BACKEND || process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "production",
    release: process.env.RAILWAY_DEPLOYMENT_ID || "unknown",

    // come da wizard: abilita PII se ti sta bene loggare IP / user ecc.
    sendDefaultPii: true,

    // niente tracing/profiling avanzato per ora
    tracesSampleRate: 0,
  });

  console.log("[SENTRY BACKEND] Initialized (basic error tracking)");
} else {
  console.log("[SENTRY BACKEND] Disabled (no DSN set)");
}
