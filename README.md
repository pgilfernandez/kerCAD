# kerCAD

Browser-based, local-first, open-source parametric CAD for learning design and digital fabrication.

kerCAD keeps SketchForge's direct workflow—simple shapes, large buttons, dragging on the workplane, and a visual inspector—but its documents are not collections of meshes. Each object has its own transform, and its geometry is rebuilt from a sequence of CAD operations using an OpenCascade B-Rep kernel.

## What you can do

- Create a container with `New Object`, then add boxes or cylinders as operations on the active object.
- Move the selected shape by dragging it on the workplane or using the arrow keys, and edit its dimensions in the inspector.
- Switch an operation between `Add`, `Hole`, and `Common` while keeping the Boolean operation editable.
- Duplicate, copy and paste, hide, delete, undo, and redo from the toolbar.
- Expand each object in the right panel to see its CAD tree: `Object (transform) → Box/Cylinder → modifiers`.
- Create fully constrained rectangular and circular sketches on the XY plane.
- Extrude to create a new solid, add material, or remove material.
- Create through or blind holes by specifying their position and diameter.
- Fillet vertical edges or all edges.
- Suppress, delete, and reorder operations in the history.
- Edit dimensions and rebuild subsequent operations.
- Save automatically to browser storage.
- Save and reopen `.kercad` packages containing the parametric document and its assets.
- Export exact B-Rep geometry as STEP or triangulated geometry as STL.
- Use face extrusion, shell, revolve, mirror, and linear or polar patterns.
- Place a workplane, drop parts onto it, and align objects or operations to a reference or to the group.
- Create and follow Challenges with instructions and resources, and import or export them as ZIP files.
- Publish projects to a shared library when server storage is configured.

Triangulation is generated for display in Three.js. The exact B-Rep geometry is the source of truth for the 3D model and the basis for STEP export.

## Architecture

```text
Parametric JSON document
  └─ object (position, rotation, scale)
       ├─ box/cylinder → hole → fillet
       └─ sequential rebuild
            └─ brepjs + OpenCascade WASM (exact B-Rep)
                 ├─ STEP
                 └─ temporary triangulation → Three.js viewport
```

Key files:

- `apps/web/src/types/parametric.ts`: document and operation schemas.
- `apps/web/src/lib/parametricDocument.ts`: document creation, validation, and history dependencies.
- `apps/web/src/lib/parametricObjects.ts`: maps shape interactions to parametric operations.
- `apps/web/src/lib/parametricKernel.ts`: B-Rep reconstruction, metrics, display meshes, and STEP export.
- `apps/web/src/components/KercadParametricEditor.tsx`: the learning environment, which follows the SketchForge workflow.
- `apps/web/src/components/ParametricViewport.tsx`: the Three.js viewport; it does not own the source geometry.

## Learning workflow

1. From the dashboard, create or open a private project, or go to Challenges to follow an activity.
2. Create an object and add shapes or a sketch you can extrude.
3. Select an operation in the tree to edit its dimensions. Later operations rebuild from those changes.
4. Position parts with the manipulators, workplane, and alignment tool.
5. Export `.kercad` to continue designing on another device, STEP for CAD exchange, or STL for 3D printing.

Select an object to edit its position, rotation, and scale. Select an operation to edit the shape's dimensions. The internal profiles used to build the B-Rep do not appear as extra entries in the tree.

## Challenges for teachers

1. Create a challenge and prepare its instructions, images, and any starter model.
2. Export it as a ZIP file and distribute it through your learning platform, or place it in the server library.
3. Students import or open the challenge and work in independent local projects.
4. Students can submit editable work by exporting a `.kercad` file.

Teachers create and edit challenges locally; the server distributes the ZIP files. Updating a challenge on the server does not automatically overwrite a local challenge with the same ID. See [library setup and updates](docs/classroom-challenges.md).

## Where projects are stored

**My Projects** uses browser storage. Switching browsers or devices does not transfer this data, and clearing site data can delete it. Export important projects regularly as `.kercad` files, especially on shared classroom devices.

**Shared** appears when the server has a library configured. Opening a shared project creates a local copy. Publishing changes is an explicit action from the dashboard or the Export dialog. Revision checks prevent overwrites if someone else has saved in the meantime; you can keep your work under a different name.

The shared library has no accounts, per-user permissions, or simultaneous editing. The date and author identify the last edit. The user supplies the author name, which the browser remembers. **The server does not keep recoverable versions.** Deleting a shared project removes it for everyone, but local copies remain. See [saving, conflicts, deletion, and backups](docs/shared-projects.md).

## Local development

For classroom deployment, see [Docker setup, persistence, and backups](docs/docker.md), [shared projects](docs/shared-projects.md), and [challenge distribution](docs/classroom-challenges.md).

Recommended requirements:

- Node.js 24 or later
- npm
- A modern browser with WebAssembly and WebGL 2

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`.

To let other devices access the development server over the network:

```sh
npm run dev -- --hostname 0.0.0.0
```

On macOS, open `http://YOUR_MAC_BONJOUR_NAME.local:3000`. Run `scutil --get LocalHostName` to find the hostname. Requests made by IP or through localhost are redirected to this stable hostname so an IP change does not create a separate project library. Each browser profile keeps its own projects. On other servers, configure a stable DNS name with `KERCAD_CANONICAL_HOST`. See [the project library and stable addresses](docs/stable-project-origin.md).

To enable persistent libraries on macOS or Linux, create the directories and start the server with absolute paths:

```sh
KERCAD_SHARED_PROJECTS_DIR=/absolute/path/to/projects KERCAD_CHALLENGES_DIR=/absolute/path/to/challenges npm run dev -- --hostname 0.0.0.0
```

Private projects and manual challenge imports do not require the shared library.

CI also builds a [standalone Linux x64 artifact](docs/production-artifact.md) with the server, its assets, and commit metadata. It includes a basic startup check outside the repository checkout.

Development verification commands:

```bash
npm run typecheck
npm run test
npm run test:browser
npm run build
```

See [Browser and device compatibility](docs/browser-compatibility.md) for the automated test matrix and recommended manual checks for Chrome/Edge, Android, Safari/iPadOS, and Firefox.

The OpenCascade kernel is about 22 MB. It loads on demand the first time a part is rebuilt and is reused for the rest of the session.

## Document model

A `.kercad` file is a ZIP package containing the versioned parametric document and the assets needed to reopen it. Version 2 also includes `model.step` with the final solid geometry for exchange and preservation independently of the operation history. Version 1 packages can still be imported. The [file format specification](docs/KERCAD_PROJECT_FORMAT.md) describes the manifest, integrity checks, and STEP representation.

The JSON operation history remains the source of truth; an STL contains triangulated geometry and is not a substitute for an editable project. This excerpt illustrates the internal document, not a complete importable package:

```json
{
  "schema": "kercad-parametric/v1",
  "name": "My first parametric part",
  "units": "mm",
  "features": [
    { "kind": "sketch", "profile": { "shape": "rectangle", "width": 80, "depth": 52 } },
    { "kind": "extrude", "sketchId": "…", "distance": 8, "operation": "new" },
    { "kind": "hole", "x": -25, "y": 0, "diameter": 12, "termination": "through-all" }
  ]
}
```

The actual file includes full identifiers, names, suppression states, and metadata.

## Distribution and next steps

- Electron desktop: [the desktop wrapper](apps/desktop/README.md) packages kerCAD for macOS, Windows, and Linux. The desktop profile persists independently of the server port. A manually triggered GitHub Actions workflow builds installers as downloadable artifacts. Packaging does not establish signing or runtime compatibility on every platform.
- Docker: the GitHub Actions workflow publishes compressed image archives for Linux amd64 and arm64. LAN access and backup restoration should still be verified in the target deployment. For prebuilt Compose deployments, use an image verified by the administrator.
- Selection export: in Export, choose **Entire project** or **Selection** for STEP and STL. Selected operations export their object's final body only once, even if you select several operations from the same object. Positions and history dependencies are preserved. The `.kercad` format always saves the entire project. Selection export still needs functional validation.
- Static export and the legacy MCP integration are not supported by the current parametric editor.

kerCAD does not include accounts, grades, centralized submissions, or real-time collaboration. Schools can continue using their learning platform to manage submissions and assessment.

## Origins and licensing

This checkout is derived from `Orbiter/SketchForge-3D-App`. Its local history starts at `0dbefbd`, and the first kerCAD parametric change is `8e11cb9`. These references do not identify an equivalent commit in the original upstream repository. The license retains attribution to SketchForge and kerCAD. Before incorporating changes from another upstream, verify that revision and its license rather than assuming they match this checkout.

The parametric kernel uses [brepjs](https://github.com/andymai/brepjs) and `occt-wasm`, which are based on OpenCascade. See each dependency's package for its license.

This repository is distributed under the MIT license included in [LICENSE](LICENSE). Contributions are welcome.
