# A stable address for personal project libraries

Browsers isolate IndexedDB by origin (protocol, hostname and port), as well as
by browser and profile. kerCAD cannot directly read another origin's library.
Using the server's changing IP therefore creates separate browser libraries.

## Stable hostname

kerCAD redirects document navigation to `KERCAD_CANONICAL_HOST` when configured.
Use only a hostname, without a protocol, port or path. The redirect retains the
requested path, query, protocol and port, and is temporary and not cached.
Keep the protocol and port stable as well. The projects still live in each
browser/profile; they are not placed in one shared server library.

During macOS development the default is the computer's Bonjour name plus
`.local`, obtained with `scutil --get LocalHostName`. That name follows the Mac
when DHCP assigns another IP. Clients must be able to resolve Bonjour/mDNS on
the same network. Renaming the computer changes this name: keep it stable.

For other platforms or production, provide a stable DNS hostname:

```sh
KERCAD_CANONICAL_HOST=cad.school.example npm run dev -- --hostname 0.0.0.0
```

Both Compose definitions also accept `KERCAD_CANONICAL_HOST` at startup. It must
resolve to the server from every client; setting it does not register a DNS name.
Use HTTPS in production. Static exports cannot perform server redirects: serve
them at a stable hostname and configure redirects in their web server.

Set `KERCAD_CANONICAL_HOST=off` to disable redirects if DNS is unavailable. Normal
API, kernel and asset requests are not redirected, nor are non-navigation calls.

## Libraries already saved under other addresses

Redirecting does not transfer or delete old browser data. Before relying on the
new address, export the old projects or copy them using the existing
`/migrate-local-projects?from=OLD_ORIGIN` page on the stable address. The utility
requires a user click to open the old origin in a separate top-level window.
The `/migrate-local-projects` page is deliberately exempt from redirects so that
its source window can still read the old origin. Keep the same browser/profile
and the old address reachable while copying; do not erase its site data.

A different browser or profile remains independent, as intended. Clearing site
data can still delete local projects. A stable hostname is not a backup: keep
project exports or another independently stored backup of important work.
