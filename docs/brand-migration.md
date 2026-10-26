# kerCAD naming and existing data

The application, editable project extension (`.kercad`), API route
(`/api/kercad-shared-projects`), asset directory (`/assets/kercad/`), internal
identifiers, environment variables (`KERCAD_*`) and deployment artifact names
use the kerCAD brand.

## Existing projects and challenges

- Legacy project packages and JSON documents are still accepted. New exports
  use the current extension, package manifest and document schema.
- Legacy challenge ZIP manifests remain importable, including server-installed
  packages. Existing ZIP files do not need to be rewritten.
- On the same browser origin, the application copies earlier browser
  preferences and both IndexedDB libraries to the current names. Existing
  current-brand records are never overwritten. Originals are retained; the
  migration markers prevent deleted records from being imported again.
- Changing the hostname, port, browser or browser profile changes the storage
  origin. Export/import projects before making such a change.

The previous brand identifier in `apps/web/src/lib/legacyBrand.ts` is deliberately
retained only to read older files and storage.

## Deployment and working copies

Use `KERCAD_*` variables, `kercad:local` and the `kercad` Compose service name.
Update deployment configuration and external automation accordingly. Existing
shared project files retain their original filenames and can still be opened,
updated or deleted through the current API.

Before switching a Docker deployment, identify its existing volume names with
`docker volume ls` and set `KERCAD_SHARED_PROJECTS_VOLUME` and
`KERCAD_CHALLENGES_VOLUME` to those names. Do not delete or recreate data volumes
as part of a branding change.

The local checkout is named `kerCAD`. Git history, remote repositories, existing
Docker images, dependencies already installed in `node_modules`, build outputs
and user-owned challenge archives are not rewritten. A future dependency
installation uses the renamed private OCCT package and its updated lockfile
integrity; the CAD runtime binary itself is unchanged.

Logo SVG contents are user-maintained and are not modified by this rename.
