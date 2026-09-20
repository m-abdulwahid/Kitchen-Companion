import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const traceSampleRate = process.env.NODE_ENV === "development" ? 1 : 0.1;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: traceSampleRate,
  tracePropagationTargets: ["localhost:8000", "localhost:8001", /^\/(?!\/)/],
  integrations: [
    Sentry.browserTracingIntegration(),
    // The cooking view contains camera and preference data. Keep replay useful
    // for interaction debugging without recording text or visual media.
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
