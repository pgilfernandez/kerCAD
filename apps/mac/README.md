# macOS packaging — preparation in progress

These scripts are inherited from SketchForge and are being adapted to kerCAD.
They do not yet constitute a validated kerCAD application or DMG. Production
server validation remains a prerequisite for accepting a desktop distribution.

## Current preparation

`prepare-web-build.mjs` copies the web application to an isolated staging
directory without modifying the legacy editor or enabling its MCP bridge.
`build-app.sh` no longer bundles the MCP launcher, adapter or coding-agent skill.
The native launcher explicitly disables the inherited MCP flag, including when
it is present in the parent environment. No MCP support is advertised for the
current parametric editor. The legacy source files remain in the repository.

Existing staged builds must be rebuilt without `--skip-web-build` once. That
option now requires a marker written only after the new build completes.

## Developer entry points

On macOS with Node 24+, npm and Xcode Command Line Tools, the inherited commands
are `bash apps/mac/build-app.sh` and `bash apps/mac/build-app-dist.sh`.
These commands build/sign artifacts; they have **not** been run for this change.
The output uses `kerCAD.app` / `kerCAD.dmg` and bundle identifier `org.kercad.desktop`.
Do not treat it as a released kerCAD desktop application.

The build stages the standalone server and browser assets, includes a Node
runtime and compiles the WKWebView launcher for the current Mac architecture.
The launcher is configured for loopback. Signing is ad hoc, not Developer ID
signing or notarization; public distribution needs its own verified process.

## Remaining work

- Adapt the application icon (the build still uses the inherited icon).
- Include classroom challenges and define persistent user libraries.
- Review Node runtime provenance and architecture compatibility.
- Validate startup outside the repository and without external Node or network.
- Check modeling, project save/reopen, imports, STEP/STL exports and challenges
  inside WKWebView, plus process shutdown and port conflicts.
- Build and validate each advertised architecture, app signature and DMG.

## Data directories

The launcher now uses `~/Library/Application Support/kerCAD/SharedProjects`,
`Challenges` and `Logs`. Teachers can place challenge ZIPs in `Challenges`.
The server is considered ready only when `/api/health` responds with HTTP 200.
The application remains bound to loopback.

SketchForge's bundle identity and data directory are separate. No existing
SketchForge projects or browser data are copied, moved or deleted. Export/import
is explicit; `.skf` history is not converted to `.kercad`. Private projects stay
in the WebView's browser storage; export `.kercad` backups before replacing apps.
