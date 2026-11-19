# Administration metrics

Set `KERCAD_ADMIN_KEY` in the server environment to a strong random secret,
then open `/admin` on the application origin and enter the key. Without a key
configured on the server, administrative access is disabled. Use HTTPS outside
localhost and consider rate limiting at the reverse proxy.

**Admin path** accepts a single URL segment of lowercase letters, digits and
hyphens (for example, `/manage-academy`). Saving it invalidates the previous
page URL immediately. The key continues to protect statistics and settings
regardless of the chosen path. To recover a forgotten path, stop the server,
back up `metrics.json`, remove only its `adminSlug` property, then restart;
the panel will be back at `/admin`.

Telemetry is disabled by default, including when upgrading an existing metrics
file without an explicit enabled flag. The first switch in `/admin` persists
the server-wide setting. Disabling immediately rejects new usage events; clients
refresh the flag within 30 seconds and stop transmitting events. Historical
totals are retained. The public preference check is an ordinary
HTTP request, not a recorded usage event.

- Project/challenge counters measure editor openings, not saved files or
  concurrently open documents. Challenge editor openings count as challenges.
- Active sessions are visible tabs that reported within the previous 90 seconds.
  Multiple tabs can belong to one browser. This count resets on server restart.
- Distinct browsers use a randomly generated localStorage identifier. They do not
  identify people, and clearing browser storage creates a new identifier.
- Documentation, project overview, donation and GitHub counts measure button
  clicks, not successful visits or donations. Blockers/offline use may omit events.
- MB are decimal browser-reported transfer sizes, not the server's total traffic.
  Cache hits, cross-origin resources, workers and non-browser clients may not be
  measured. They must not be used for bandwidth billing or capacity planning.
- No project names, geometry, IP addresses or account details are collected.
  The random browser identifier is persistent pseudonymous telemetry; review
  applicable privacy/consent requirements before a public deployment.

Totals are written atomically to `metrics.json` in `KERCAD_METRICS_DIR`, or
`.local-data/admin/` under the server working directory by default (git-ignored).
For Docker or packaged deployments set the directory to a writable persistent
volume, e.g. `KERCAD_METRICS_DIR=/data/metrics`. Back up that directory to retain
totals. This initial file-backed implementation targets one server process;
use a shared database before scaling to multiple processes/replicas.

The sponsor popup switch is independent of telemetry and is on by default.
Its setting is stored in the same file. When off, the editor still waits for
its initial model, but skips the sponsor popup and its minimum display time.

The admin page refreshes every 10 seconds. Browsers heartbeat every 30 seconds.
There is no reset/delete endpoint. Historical usage before activation cannot be
recovered by these counters. Exported project files are not counted as HTTP
downloads: client-side generated downloads never pass through the server.
