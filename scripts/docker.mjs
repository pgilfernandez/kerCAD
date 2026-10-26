// Pass the source revision into Docker without including Git or .git in images.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [action, ...extraArgs] = process.argv.slice(2);
if (action !== "build" && action !== "up") {
  console.error("Usage: node scripts/docker.mjs build|up [Docker arguments]");
  process.exit(1);
}

let revision = process.env.KERCAD_COMMIT || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
if (!revision) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    console.warn("Git revision unavailable. Set KERCAD_COMMIT to include it in the information popup.");
  }
}
if (revision && !/^[a-f0-9]{7,40}$/i.test(revision)) {
  console.error("KERCAD_COMMIT must be a Git commit hash (7–40 hexadecimal characters).");
  process.exit(1);
}

const args = action === "build"
  ? ["build", "-f", "deploy/docker/Dockerfile", "-t", "kercad:local", "--build-arg", `KERCAD_COMMIT=${revision || ""}`, ...extraArgs, "."]
  : ["compose", "-f", "deploy/docker/compose.yaml", "up", "--build", "-d", ...extraArgs];
const result = spawnSync("docker", args, { cwd: root, stdio: "inherit", env: { ...process.env, KERCAD_COMMIT: revision || "" } });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
