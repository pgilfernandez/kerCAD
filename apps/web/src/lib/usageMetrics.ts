let visitor = "", session = "", bytes = 0;
function identify() {
  if (session) return;
  session = crypto.randomUUID();
  try { visitor = localStorage.getItem("kercad.metrics-browser") ?? crypto.randomUUID(); localStorage.setItem("kercad.metrics-browser", visitor); }
  catch { visitor = crypto.randomUUID(); }
}
export function reportUsage(event?: "project" | "challenge" | "documentation" | "overview" | "donate" | "github") {
  if (typeof window === "undefined" || location.pathname.startsWith("/admin")) return;
  identify();
  const body = JSON.stringify({ visitor, session, bytes, active: document.visibilityState === "visible", ...(event ? { event, id: crypto.randomUUID() } : {}) });
  void fetch("/api/admin/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
export function addUsageBytes(size: number) { if (Number.isFinite(size) && size > 0) bytes += size; }
