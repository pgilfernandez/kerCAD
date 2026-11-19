import { adminPasswordRequired, deleteSharedProjects, initializeAdminPassword, metricEvents, readAdminPasswordHash, readMetrics, readTelemetryEnabled, recordMetrics, removeAdminPassword, setAdminSlug, setMetricsEnabled, setSharedProjectsDirectory, setSharedProjectsEnabled, setSponsorPopupEnabled } from "@/lib/adminMetrics";
import { configuredAdminKey, hashAdminPassword, isAdminAuthorized, normalizeAdminSlug } from "@/lib/adminAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function adminMetricsResponse(hash: string | undefined) {
  const managed = Boolean(configuredAdminKey());
  return Response.json({ ...await readMetrics(managed || hash !== undefined), adminPasswordManagedByServer: managed }, { headers });
}
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("status")) return Response.json({ enabled: await readTelemetryEnabled() }, { headers });
  const hash = await readAdminPasswordHash();
  if (!await isAdminAuthorized(request, hash)) return new Response(null, { status: 401, headers });
  return adminMetricsResponse(hash);
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new Response(null, { status: 413 });
  const text = await request.text(); if (text.length > 2048) return new Response(null, { status: 413 });
  let input;
  try { input = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  if (input?.action === "delete-shared-projects") {
    const hash = await readAdminPasswordHash();
    if ((hash === undefined && !configuredAdminKey()) || !await isAdminAuthorized(request, hash)) return new Response(null, { status: 401, headers });
    if (typeof input.directory !== "string" || input.confirm !== true) return new Response(null, { status: 400, headers });
    try {
      const result = await deleteSharedProjects(input.directory, hash);
      return result ? Response.json(result, { headers }) : new Response(null, { status: 409, headers });
    } catch {
      return new Response(null, { status: 500, headers });
    }
  }
  if (input?.action === "remove-password") {
    const hash = await readAdminPasswordHash();
    if (!hash || configuredAdminKey()) return new Response(null, { status: 409, headers });
    if (!await isAdminAuthorized(request, hash)) return new Response(null, { status: 401, headers });
    return new Response(null, { status: await removeAdminPassword(hash) ? 204 : 409, headers });
  }
  if (input?.action === "setup-password") {
    if (await adminPasswordRequired()) return new Response(null, { status: 409, headers });
    const password = input.password;
    if (typeof password !== "string" || password.length < 8 || password.length > 128 || !password.trim() || password !== input.confirmation) {
      return new Response(null, { status: 400, headers });
    }
    const saved = await initializeAdminPassword(await hashAdminPassword(password));
    return new Response(null, { status: saved ? 204 : 409, headers });
  }
  if (input?.action === "admin-route") {
    const hash = await readAdminPasswordHash();
    if (!await isAdminAuthorized(request, hash)) return new Response(null, { status: 401, headers });
    const slug = typeof input.slug === "string" ? normalizeAdminSlug(input.slug) : null;
    if (!slug) return new Response(null, { status: 400, headers });
    if (!await setAdminSlug(slug, hash)) return new Response(null, { status: 409, headers });
    return Response.json({ path: `/${slug}` }, { headers });
  }
  if (input?.action === "shared-projects-directory") {
    const hash = await readAdminPasswordHash();
    if ((hash === undefined && !configuredAdminKey()) || !await isAdminAuthorized(request, hash)) return new Response(null, { status: 401, headers });
    if (typeof input.directory !== "string") return new Response(null, { status: 400, headers });
    const result = await setSharedProjectsDirectory(input.directory.trim(), hash);
    if (result !== "saved") return new Response(null, { status: result === "invalid" ? 400 : 409, headers });
    return adminMetricsResponse(hash);
  }
  if ((input?.action === "telemetry" || input?.action === "sponsor-popup" || input?.action === "shared-projects") && typeof input.enabled === "boolean") {
    const hash = await readAdminPasswordHash();
    if (!await isAdminAuthorized(request, hash)) return new Response(null, { status: 401, headers });
    const update = input.action === "telemetry" ? setMetricsEnabled : input.action === "sponsor-popup" ? setSponsorPopupEnabled : setSharedProjectsEnabled;
    await update(input.enabled);
    return adminMetricsResponse(hash);
  }
  const validId = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  if (!input || !validId(input.visitor) || !validId(input.session) || !Number.isFinite(input.bytes) || input.bytes < 0 || input.bytes > 1e11 || (input.event && (!metricEvents.includes(input.event) || !validId(input.id)))) return new Response(null, { status: 400 });
  await recordMetrics({ ...input, active: input.active === true });
  return new Response(null, { status: 204 });
}
