import type { NextConfig } from "next";
import path from "node:path";
import { execFileSync } from "node:child_process";
// Next loads this config from the repository root; use an absolute dependency
// path so its temporary config module can resolve the shared TypeScript helper.
const { normalizeCanonicalHost } = require(path.join(__dirname, "src/lib/canonicalHost.ts")) as typeof import("./src/lib/canonicalHost");

function applicationCommit() {
  // CI/archive builds can supply the revision without shipping .git or Git.
  const revision = process.env.KERCAD_COMMIT ?? process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (revision && /^[a-f0-9]{7,40}$/i.test(revision)) return revision.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "—";
  }
}

const isStaticExport = process.env.STATIC_EXPORT === "true";
const isDockerBuild = (process.env.KERCAD_DOCKER_BUILD ?? process.env.SKETCHFORGE_DOCKER_BUILD) === "true";
function canonicalDevelopmentHost() {
  if (process.env.KERCAD_CANONICAL_HOST !== undefined) return normalizeCanonicalHost(process.env.KERCAD_CANONICAL_HOST);
  if (isStaticExport || process.env.NODE_ENV !== "development" || process.platform !== "darwin") return "";
  try {
    const localName = execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return normalizeCanonicalHost(`${localName}.local`);
  } catch { return ""; }
}
const canonicalHost = canonicalDevelopmentHost();
const extraAllowedDevOrigins = (process.env.KERCAD_ALLOWED_DEV_ORIGINS ?? process.env.SKETCHFORGE_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  devIndicators: false,
  // Keep the live development compiler isolated from `next build`. Sharing
  // `.next` lets a production verification build invalidate chunks used by a
  // running dev server, which also breaks API routes such as project snapshots.
  distDir: isStaticExport ? ".next-export" : process.env.NODE_ENV === "development"
    ? process.env.KERCAD_BROWSER_TEST === "1" ? ".next-browser-test" : ".next-dev"
    : ".next",
  allowedDevOrigins: ["localhost", "127.0.0.1", ...(canonicalHost ? [canonicalHost] : []), ...extraAllowedDevOrigins],
  env: {
    NEXT_PUBLIC_KERCAD_COMMIT: applicationCommit(),
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "true" : "false",
    NEXT_PUBLIC_KERCAD_CANONICAL_HOST: canonicalHost,
  },
  images: {
    unoptimized: true
  },
  // brepjs (loaded lazily by the STEP exporter) ships an auto-init helper that
  // tries optional kernel backends via guarded `import().catch()`. We only install
  // and use occt-wasm, so silence the resolution warnings for the backends we omit.
  webpack: (config) => {
    // Desktop staging already duplicates the standalone output; avoid keeping
    // another large persistent webpack cache during installer builds.
    if (process.env.KERCAD_DESKTOP_BUILD === "true") config.cache = false;
    config.resolve.alias = {
      ...config.resolve.alias,
      "brepkit-wasm": false,
      "brepjs-opencascade": false,
    };
    return config;
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : isDockerBuild
      ? { output: "standalone" as const }
      : {}),
};

export default nextConfig;
