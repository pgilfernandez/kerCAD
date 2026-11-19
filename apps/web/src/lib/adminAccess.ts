import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const reserved = new Set(["api", "assets", "occt", "documentation", "migrate-local-projects"]);

export function normalizeAdminSlug(value: string) {
  const slug = value.trim().replace(/^\//, "");
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) && !reserved.has(slug) ? slug : null;
}

export const configuredAdminKey = () => process.env.KERCAD_ADMIN_KEY?.trim() || null;
const deriveKey = promisify(scrypt);

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt, 32) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function isAdminAuthorized(request: Request, passwordHash: string | undefined) {
  const key = configuredAdminKey();
  if (!key && passwordHash === undefined) return true;
  const header = request.headers.get("authorization");
  if (!header || header.length > 2048) return false;
  const basic = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString("utf8") : "";
  const supplied = basic.startsWith("admin:") ? basic.slice(6) : header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied) return false;
  if (key) {
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(key), digest(supplied));
  }
  if (typeof passwordHash !== "string" || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(passwordHash)) return false;
  const [salt, hash] = passwordHash.split(":");
  return timingSafeEqual(await deriveKey(supplied, salt, 32) as Buffer, Buffer.from(hash, "hex"));
}
