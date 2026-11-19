import { createHash, timingSafeEqual } from "node:crypto";

const reserved = new Set(["api", "assets", "occt", "documentation", "migrate-local-projects"]);

export function normalizeAdminSlug(value: string) {
  const slug = value.trim().replace(/^\//, "");
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) && !reserved.has(slug) ? slug : null;
}

export function isAdminAuthorized(request: Request) {
  const key = process.env.KERCAD_ADMIN_KEY?.trim();
  const header = request.headers.get("authorization");
  if (!key || !header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(key), digest(header.slice(7)));
}
