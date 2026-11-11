# kerCAD desktop — Electron

Shared desktop host for macOS, Windows and Linux. It reuses the unmodified CAD
engine and Next.js application. The Legacy Intel `.app` has been built and its
window, internal origin and local APIs checked on macOS 12.7.6. Full CAD workflows,
installers and the other OS/architecture combinations remain unvalidated.
The inherited Swift host in `apps/mac` is retained separately.

## Local commands

Use Node 24+ and install both dependency sets from the repository root:

```sh
npm ci
npm ci --prefix apps/desktop
npm run desktop:prepare
npm run desktop:start
```

`desktop:prepare` builds the standalone server, copies public/OCCT assets and
bundled challenge ZIPs, and generates packaging icons from
`apps/web/public/assets/kercad/kercad_logo_color.svg`. It replaces only the
generated `apps/desktop/staging` directory, never user data. Development keeps
using `.next-dev`, independently of the production `.next` output.

To build installers, on the target OS and CPU architecture:

```sh
npm run desktop:package
```

Outputs go to `dist/desktop`: macOS DMG, Windows NSIS EXE, Linux AppImage/DEB.
Build outputs are separated into `dist/desktop/current` and `dist/desktop/legacy`.
Installers use only the application name: `kerCAD.dmg`, `kerCAD.exe`,
`kerCAD.AppImage` and `kerCAD.deb`. OS/architecture and the seven-character commit
identify the separate Actions artifacts, not the filenames inside them.
Keep different builds in separate directories when downloading/extracting them.
No Mac ZIP is generated.

### macOS compatibility variants

- **Current:** Electron 45.3.0, minimum macOS 13 Ventura.
- **Legacy:** Electron 43.8.8, minimum macOS 12 Monterey, no Big Sur support.
  Electron 43 reaches upstream end of support on January 5, 2027; retaining this
  runtime after that date does not provide ongoing security maintenance.

To build only a Legacy `.app`, from macOS:

```sh
KERCAD_DESKTOP_VARIANT=legacy npm --prefix apps/desktop run package -- --mac --dir
```

`desktop:start` uses the current development Electron installation. Open the
packaged Legacy `.app` instead when testing on Monterey.
Actions produces both Mac variants for Intel and Apple Silicon. The artifact
name includes `current` or `legacy`; each Mac artifact contains only `kerCAD.dmg`.
The desktop package uses version 0.9.0 independently of the historical root npm
version. The application's information panel retains the compiled Git commit.
No external Node installation or Docker is needed to run an installed package.

## Persistence and server lifecycle

The renderer always loads `kercad://app/`. The local server uses a kernel-assigned
loopback port behind that protocol, so browser databases do not change origin
when ports are busy. The profile is fixed under the OS application-data folder:

- macOS: `~/Library/Application Support/kerCAD-Desktop`
- Windows: `%APPDATA%/kerCAD-Desktop`
- Linux: `$XDG_CONFIG_HOME/kerCAD-Desktop` (normally `~/.config/kerCAD-Desktop`)

Projects, installed challenges and preferences retain their existing IndexedDB/
localStorage implementation in the persistent Electron session. `SharedProjects`,
`Challenges` (ZIP packages) and `Logs/server.log` are separate subdirectories.
Bundled challenge packages are seeded only when a file with that name is absent.
Clearing the profile can still erase browser databases: export `.kercad` backups.
Browser/Safari/Swift-host libraries are not migrated automatically; use explicit
export/import to avoid silently mixing or replacing existing libraries.
The Legacy variant has its own bundle ID and uses `kerCAD-Desktop-Legacy` rather
than `kerCAD-Desktop`. Do not share Chromium profiles between different runtime
versions; transfer projects explicitly via `.kercad` export/import instead.

Closing requests a renderer save, accepts the focused numeric field and waits
for the existing IndexedDB write queue. If saving fails or times out, native
translated buttons allow retry, cancel or explicit discard. Draft sketches and
challenge edits still need their own Accept/Finish before closing; these modes
trigger the retry/cancel/discard prompt rather than silently accepting a draft.
Autosave does not turn unfinished transient tools into committed operations. The local server
is stopped when the application quits; it does not listen on the LAN.

## Security

The renderer is sandboxed with context isolation and no Node integration. There
is no general-purpose filesystem, shell or IPC API in the preload: only a close/
save acknowledgement. Navigation stays within the internal origin; external HTTP
and HTTPS links open in the system browser. Other external schemes and WebView
embedding are denied. Web permissions are denied by default. The legacy MCP
bridge is not enabled. Unexpected server exit reports a native error and logs.

## GitHub artifacts and distribution status

Run **Package desktop applications** manually in Actions. It packages natively
for macOS Intel/Apple Silicon, Windows x64 and Linux x64/ARM64, uploading installers
as 14-day artifacts. Merely uploading an artifact does not establish that its
installer, WebGL, WASM workers or data persistence work on a target device.

Signing/notarization and automatic updating are not configured. Unsigned macOS
and Windows packages may trigger OS warnings. Before public distribution, add
Developer ID/notarization and Windows signing with protected CI credentials.
Linux needs its standard desktop/graphics system libraries. Supported OS minimums
are those of the pinned Electron runtime and must be confirmed on target devices.

Validation checklist: cold start/offline, port conflicts, multiple-instance
launch, WebGL/WASM modeling, sketch accept/cancel, save/reopen after updates,
challenge import/edit, SVG/image/STEP imports, STL/STEP/project downloads, external
documentation, close during edits, server failure and uninstall data retention.
