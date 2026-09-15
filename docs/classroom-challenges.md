# Distribute classroom challenges

Teachers create or edit challenges in eduCAD and export ZIP packages. The server can distribute those packages to each browser; students still work in their own local projects.

## Local server

Set `EDUCAD_CHALLENGES_DIR` to an absolute directory containing the ZIP packages:

```sh
EDUCAD_CHALLENGES_DIR=/srv/educad/challenges npm run dev -- --hostname 0.0.0.0 --port 3000
```

Without configuration, development uses `apps/web/challenges`; the standalone server resolves that folder from its own web directory. Only regular ZIP files are listed. Names must start with a letter or digit and contain only letters, digits, spaces, dots, underscores or hyphens. Downloads are limited to 40 MiB per package, matching the challenge importer. Invalid packages do not prevent other activities from loading.

## Docker built from this checkout

Compose mounts a separate `educad-challenges` volume at `/data/challenges`, read-only for the application. A new named volume is initially populated with any packages included when the image was built. Existing volume contents survive container replacement and are not automatically replaced by newer image contents.

For teachers who update activities regularly, use a host directory:

```sh
EDUCAD_CHALLENGES_VOLUME=/srv/educad/challenges docker compose -f deploy/docker/compose.yaml up --build -d
```

Create that directory first, grant the container read access, and place exported ZIP files there. Reload eduCAD in the students' browsers to discover new packages. Back up this directory separately from shared projects. The app does not upload edited challenges back to this folder: publishing remains an explicit teacher/administrator action.

## Identity and updates

Automatic installation preserves any already-installed challenge with the same ID. Replacing a server ZIP with another package having that ID does not overwrite a student's or teacher's local challenge. To distribute a separate revised activity automatically, it needs a different ID; otherwise users can explicitly import the revised ZIP. Removing a package from the server does not delete copies already installed in browsers.

Automatic version migration and a teacher publishing interface are not implemented. Manual ZIP import continues to work without a server library.

The prebuilt Compose now requires an explicit `EDUCAD_IMAGE` referencing an eduCAD image verified by the administrator; it no longer defaults to the upstream image. Use the Compose that builds this checkout until such an image is available. See [Docker deployment](docker.md). These deployment changes have not been tested or built following the request to continue without tests.
