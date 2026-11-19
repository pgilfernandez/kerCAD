import { metricEvents, readMetrics, recordMetrics, setMetricsEnabled, setSponsorPopupEnabled } from "@/lib/adminMetrics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await readMetrics(), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("host")) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new Response(null, { status: 413 });
  const text = await request.text(); if (text.length > 2048) return new Response(null, { status: 413 });
  let input;
  try { input = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  if ((input?.action === "telemetry" || input?.action === "sponsor-popup") && typeof input.enabled === "boolean") {
    await (input.action === "telemetry" ? setMetricsEnabled : setSponsorPopupEnabled)(input.enabled);
    return Response.json(await readMetrics(), { headers: { "Cache-Control": "no-store" } });
  }
  const validId = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  if (!input || !validId(input.visitor) || !validId(input.session) || !Number.isFinite(input.bytes) || input.bytes < 0 || input.bytes > 1e11 || (input.event && (!metricEvents.includes(input.event) || !validId(input.id)))) return new Response(null, { status: 400 });
  await recordMetrics({ ...input, active: input.active === true });
  return new Response(null, { status: 204 });
}
