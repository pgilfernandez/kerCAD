# eduCAD Challenges roadmap

## Package format (v1)

A challenge is one portable ZIP file. Its root contains `challenge.json`; referenced images live anywhere below the root and are bundled into the installed challenge.

```json
{
  "format": "educad-challenge",
  "version": 1,
  "id": "key-tag",
  "title": "Key Tag",
  "description": "Build a key tag from simple shapes.",
  "author": "Example School",
  "cover": "images/cover.png",
  "workspace": "workspace.json",
  "steps": [
    {
      "id": "intro",
      "label": "BEFORE YOU START",
      "title": "Build a Key Tag",
      "body": "Set the snap spacing, then build the key tag.",
      "image": "images/final.png",
      "values": [{ "label": "Snap spacing", "value": "0.5 mm" }]
    }
  ]
}
```

## Delivery stages

1. **Player and local library (current MVP)** — ZIP installation, package validation, local persistence, installed challenge list, empty project launch, step navigation, images and floating/left/right docking.
2. **Authoring MVP (current)** — create and edit challenges inside the 3D workspace, insert steps, edit arbitrary name/value parameters, capture clean viewport images, retain the teacher workspace, and export a round-trip-safe ZIP.
3. **Progress and starter projects** — persist current step and completion, choose whether learners begin empty or from a bundled starter document, resume challenges, and expose reset/restart.
4. **Automatic checks** — declarative checks for object/operation count, feature kind and mode, dimensions, transforms, visibility, locking, constraints, and final shape properties. Checks must provide helpful hints without blocking free exploration.
5. **Classroom workflow** — export/import learner results, teacher-issued challenge collections, completion summaries, and privacy-safe local-first reporting.
6. **Advanced authoring** — validation-rule editing, live learner preview, reusable step templates, schema migration and compatibility checks.

## Format evolution rules

- Keep challenge packages self-contained and usable offline.
- Never execute JavaScript or HTML from a package; instructional text is plain text and media is restricted to supported image formats.
- Version the manifest and validate file paths, compressed size and unpacked size before installation.
- Keep completion checks declarative so packages remain safe to share between schools.
