/** Browser-safe URL helpers for the server-side Realtime relay. */
export const LIVE_API_URL =
  process.env.NEXT_PUBLIC_LIVE_API_URL ?? "http://localhost:8001";

export function liveSocketUrl(sessionId: string): string {
  const url = new URL(`/api/live/${encodeURIComponent(sessionId)}`, LIVE_API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
