# kerCAD project packages (`.kercad`)

A `.kercad` file is a standard ZIP archive. Version 2 includes both the editable
parametric document and an independent STEP representation of its final solids.
Another CAD application can extract and import `model.step` without understanding
the kerCAD history or running kerCAD. Keep the complete package for editable work.

## Version 2 layout

```text
project.kercad
├── manifest.json
├── project.json
├── model.step          Final exact B-Rep, when the project contains active solids
└── assets/
    └── <sha256>.<ext>  Deduplicated original source assets
```

`manifest.json` uses schema `org.kercad.project`, `formatVersion: 2` and
`minimumReaderVersion: 2`. Its existing `document` and `assets` records retain
version 1's meaning. `geometry` is either `null` or an object containing:

```json
{
  "path": "model.step",
  "mediaType": "application/step",
  "units": "mm",
  "byteLength": 12345,
  "sha256": "<64 lowercase hexadecimal characters>"
}
```

The byte count and SHA-256 cover the exact uncompressed STEP bytes. These are
checked on import, alongside the document and source assets. Unexpected archive
entries and unsafe paths are rejected. Current limits are 256 MiB compressed,
512 MiB expanded, 32 MiB for `project.json`, 128 MiB per source asset or STEP file,
and 1024 archive entries.

## Geometry semantics

- `model.step` is regenerated from a snapshot of the same document written to
  `project.json`, including final Boolean operations and each object's world
  position, rotation and scale. It contains all project solids, including hidden
  bodies. It does not follow the separate STEP/STL selection-only export controls.
- Geometry remains in millimeters regardless of the document's display units.
- Original imported STEP assets remain sources below `assets/`. They are distinct
  from the newly generated final model, so source geometry cannot become a stale
  substitute for the finished part.
- Empty, sketch-only, annotation-only and reference-mesh/image-only documents
  have `geometry: null` and no `model.step`. These have no exact solid to export;
  their editable content and assets remain in the package.
- If a project has solid-generating operations but the STEP cannot be generated,
  export fails with an explicit error. It does not silently deliver a package
  missing its promised geometry. IndexedDB autosave is independent of export.

The shared packaging function applies this to editor downloads, project-library
downloads and shared-project saves. Native import continues to use `project.json`
for editable history; `importKercadProject()` also returns the verified STEP bytes
as `step` for consumers that need the exchange representation.

## Compatibility and preservation

The current reader accepts version 1 and version 2 packages. Existing version 1
projects remain editable and gain a freshly generated STEP when re-exported.
Version 1 readers may reject version 2; the explicit reader version prevents an
older application from treating the additional entry as corruption or dropping
it unnoticed. Standard ZIP tools can always extract `model.step` directly.

Package versions, the parametric document's own schema version, and the app's
`createdWithVersion` are separate. Future package extensions must declare their
entries in a versioned manifest while retaining interoperable representations.

Validation covers legacy import, integrity failures, source-asset separation,
empty documents and generation errors in `tests/unit/kercadProject.test.ts`.
`tests/e2e/kercadPackageStep.e2e.ts` extracts the embedded STEP and imports it using
real OpenCascade, checking final Boolean volume, world placement, physical units,
hidden/scaled bodies and a revolution used as the first solid operation.
