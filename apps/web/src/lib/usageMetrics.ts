let visitor = "", session = "", bytes = 0;
let enabled = false, checkedAt = 0;
let checking: Promise<boolean> | null = null;
async function telemetryEnabled() {
  if (Date.now() - checkedAt < 30000) return enabled;
  checking ??= fetch("/api/admin/metrics?status", { cache: "no-store" }).then(async (response) => {
    enabled = response.ok && (await response.json()).enabled === true;
    checkedAt = Date.now(); return enabled;
  }).catch(() => { enabled = false; checkedAt = Date.now(); return false; }).finally(() => { checking = null; });
  return checking;
}
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
export async function reportUsage(event?: "project" | "challenge" | "documentation" | "overview" | "donate" | "donateGithub" | "donatePaypal" | "github") {
  const donation = event === "donate" || event === "donateGithub" || event === "donatePaypal";
  if (typeof window === "undefined" || (!donation && location.pathname.startsWith("/admin"))) return;
  if (!await telemetryEnabled()) return;
  try {
    identify();
    const body = JSON.stringify({ visitor, session, bytes, active: document.visibilityState === "visible", ...(event ? { event, id: metricId() } : {}) });
    void fetch("/api/admin/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* Optional telemetry must never interrupt the editor. */ }
}
export function addUsageBytes(size: number) { if (enabled && Number.isFinite(size) && size > 0) bytes += size; }
