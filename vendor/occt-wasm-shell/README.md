# Shell corner modes

The local `occt-wasm-3.6.1+educad.1.tgz` package retains the upstream 3.6.1
JavaScript API and adds two native Embind methods: `shellSharp` and
`shellSharpWithHistory`. Both use `GeomAbs_Intersection` joins, including the
normal topology-history path used by brepjs. Existing `shell` methods retain
their original `GeomAbs_Arc` behavior.

Source: https://github.com/andymai/occt-wasm at
`c4a96db7bb6ec7eed294dec42ba92fe4b6e0f580` (tag `v3.6.1`).
OCCT submodule: `6e1fe656bf028bf0004482c389661587b269fc65`.
The complete local source changes are in `sharp-shell.patch`.

## Rebuild

Use Emscripten 5.0.3, CMake, Ninja and Node.js. In a fresh upstream checkout:

```sh
git checkout v3.6.1
git submodule update --init occt
git apply /path/to/eduCAD/vendor/occt-wasm-shell/sharp-shell.patch
bash scripts/fetch-rapidjson.sh
node /path/to/eduCAD/scripts/build-occt-shell.mjs "$PWD"
node /path/to/eduCAD/scripts/package-occt-shell.mjs "$PWD"
```

The patch intentionally includes the generated C++ files: do not rerun upstream
codegen afterward. `EDUCAD_BUILD_JOBS` controls native build parallelism (4 by
default). `EDUCAD_OCCT_LIB_DIR` can point to matching prebuilt static libraries.
For the initial build, these came from the upstream builder OCI image manifest
`sha256:6e871f152e6dc297db6894118233cf951d400b0128c8a311a21e29a9f6840e0c`,
layer `sha256:34d877da2367a47275a2950c85967a3fd95ebbbf0832dbdfbe4ee32956edf746`
at `ghcr.io/andymai/occt-wasm-builder` (OCCT 8.0.1, Emscripten 5.0.3).

Install the generated tarball with npm, then run `npm run copy:occt`. Normal
`npm ci`, development and production builds use this packaged runtime without
requiring a C++ compiler. The app keeps two brepjs adapters sharing one native
shape store; sharp Shell calls switch adapters synchronously and restore the
normal adapter even on failure.

The package includes the upstream MIT/Apache licenses and the OCCT LGPL 2.1
license and exception. The WASM artifact inherits OCCT's licensing; the pinned
sources, patch and build scripts above permit rebuilding the modified runtime.
