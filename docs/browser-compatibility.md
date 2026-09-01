# Browser and device compatibility

eduCAD targets current evergreen browsers with WebAssembly, Web Workers and WebGL 2. The exact CAD model remains independent of the display device; device differences affect interaction and viewport rendering only.

## Automated smoke matrix

`npm run test:browser` starts the editor and runs the same core checks in Chromium with these profiles:

| Profile | Viewport | Pointer model | Automated checks |
| --- | ---: | --- | --- |
| Desktop | 1440 × 900 | Mouse and keyboard | Editor/canvas load, primary controls, no page overflow, modal focus cycle and Escape |
| Tablet | 1024 × 768 | Touch | Same core workflow with touch capability enabled |
| Mobile | 390 × 844 | Touch/mobile | Same core workflow at the narrow supported layout |

Install the test browser once on a development machine:

```bash
npx playwright install chromium
npm run test:browser
```

On older macOS versions that are no longer served a bundled Chromium build, the test configuration automatically uses Google Chrome from `/Applications` when it is installed; in that case only `npm run test:browser` is required.

CI installs Chromium with its operating-system dependencies and runs this matrix for every push and pull request.

## Supported browsers

| Browser/device | Status | Notes |
| --- | --- | --- |
| Chrome/Edge desktop | Automated | Primary supported desktop path. |
| Chrome on Android/tablets | Emulated automatically | Real-device touch checks remain recommended before a release. |
| Safari on macOS and iPadOS | Manual | Verify WebGL/WASM startup, touch camera gestures and file import/export before a release. |
| Firefox desktop | Manual | Verify WebGL/WASM startup and file download behaviour before a release. |

The mobile layout supports the core create, select and edit flow, but a larger screen remains preferable for long histories and detailed sketches. Browser automation cannot validate GPU-driver rendering artefacts, multi-finger gesture feel, native file pickers or sustained thermal performance; those remain part of release testing on physical devices.
