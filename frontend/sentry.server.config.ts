import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const traceSampleRate = process.env.NODE_ENV === "development" ? 1 : 0.1;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: traceSampleRate,
  // Profiles are collected only while sampled traces are active. Keep local
  // verification comprehensive without profiling every production request.
  profileSessionSampleRate: traceSampleRate,
  profileLifecycle: "trace",
  integrations: [nodeProfilingIntegration()],
});
