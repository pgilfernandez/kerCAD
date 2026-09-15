export const dynamic = "force-dynamic";

// Optional libraries must not determine server health.
export function GET() {
  return Response.json({ status: "ok", application: "eduCAD" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
