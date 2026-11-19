import { metricEvents, readMetrics, readTelemetryEnabled, recordMetrics, setAdminSlug, setMetricsEnabled, setSharedProjectsEnabled, setSponsorPopupEnabled } from "@/lib/adminMetrics";
import { isAdminAuthorized, normalizeAdminSlug } from "@/lib/adminAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("status")) return Response.json({ enabled: await readTelemetryEnabled() }, { headers });
  if (!isAdminAuthorized(request)) return new Response(null, { status: 401, headers });
  return Response.json(await readMetrics(), { headers });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new Response(null, { status: 413 });
  const text = await request.text(); if (text.length > 2048) return new Response(null, { status: 413 });
  let input;
  try { input = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  if (input?.action === "admin-route") {
    if (!isAdminAuthorized(request)) return new Response(null, { status: 401, headers });
    const slug = typeof input.slug === "string" ? normalizeAdminSlug(input.slug) : null;
    if (!slug) return new Response(null, { status: 400, headers });
    await setAdminSlug(slug);
    return Response.json({ path: `/${slug}` }, { headers });
  }
  if ((input?.action === "telemetry" || input?.action === "sponsor-popup" || input?.action === "shared-projects") && typeof input.enabled === "boolean") {
    if (!isAdminAuthorized(request)) return new Response(null, { status: 401, headers });
    const update = input.action === "telemetry" ? setMetricsEnabled : input.action === "sponsor-popup" ? setSponsorPopupEnabled : setSharedProjectsEnabled;
    await update(input.enabled);
    return Response.json(await readMetrics(), { headers: { "Cache-Control": "no-store" } });
  }
  const validId = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  if (!input || !validId(input.visitor) || !validId(input.session) || !Number.isFinite(input.bytes) || input.bytes < 0 || input.bytes > 1e11 || (input.event && (!metricEvents.includes(input.event) || !validId(input.id)))) return new Response(null, { status: 400 });
  await recordMetrics({ ...input, active: input.active === true });
  return new Response(null, { status: 204 });
}
