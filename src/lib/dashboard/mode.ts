export type DashboardMode = "off" | "server" | "browser";

/**
 * off     - the dashboard does not exist (404).
 * server  - data lives in this server's SQLite database (owner mode).
 * browser - data lives in each visitor's own browser; the server only scans.
 *
 * LINKGUARD_DASHBOARD_ENABLED=true is the older switch and still means "server".
 */
export function getDashboardMode(): DashboardMode {
  const mode = process.env.LINKGUARD_DASHBOARD_MODE;
  if (mode === "browser") return "browser";
  if (mode === "server") return "server";
  if (mode === "off") return "off";
  return process.env.LINKGUARD_DASHBOARD_ENABLED === "true" ? "server" : "off";
}