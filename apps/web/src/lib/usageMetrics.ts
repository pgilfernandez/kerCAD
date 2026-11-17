let visitor = "", session = "", bytes = 0;
function metricId() {
  if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
  if (typeof window.crypto?.getRandomValues === "function") {
    return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function identify() {
  if (session) return;
  session = metricId();
  try { visitor = localStorage.getItem("kercad.metrics-browser") ?? metricId(); localStorage.setItem("kercad.metrics-browser", visitor); }
  catch { visitor = metricId(); }
}
export function reportUsage(event?: "project" | "challenge" | "documentation" | "overview" | "donate" | "github") {
  if (typeof window === "undefined" || location.pathname.startsWith("/admin")) return;
  try {
    identify();
    const body = JSON.stringify({ visitor, session, bytes, active: document.visibilityState === "visible", ...(event ? { event, id: metricId() } : {}) });
    void fetch("/api/admin/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* Optional telemetry must never interrupt the editor. */ }
}
export function addUsageBytes(size: number) { if (Number.isFinite(size) && size > 0) bytes += size; }
