# Application themes

The application offers explicit **Light** (default) and **Dark** themes in the
appearance/language menu shared by the dashboard, documentation and editors.
The preference is browser-local (`kercad.theme`), synchronized between tabs and
applied before hydration to avoid a light flash when opening a dark workspace.
The previous `sketchForge.theme` preference remains readable for migration.

## Styling contract

- `tokens.css`: shared palette, including canvas and grid colors. The light values
  preserve existing colors. Common roles have semantic names (`--theme-surface`,
  `--theme-text`, `--theme-border`, `--theme-active`). Suffixed variables preserve
  intentionally different existing shades without changing the light design.
- Sparse shades use `var(--theme-dark-ROLE, ORIGINAL_LIGHT_COLOR)`: a small set of
  dark roles replaces many one-off overrides while preserving exact light values.
- `dark-overrides.css`: appearance/language chooser and dark paint for SVG sketch
  elements and components requiring selector-specific overrides. No layout changes.
- `legacy-dark.css`: previous dark selectors kept separately for legacy editor
  compatibility; shared layout and responsive rules remain in `globals.css`.

For new controls, reuse semantic variables instead of adding another literal color
or shade token. Keep layout rules common to both themes. Do not use global inversion
filters: user-assigned CAD colors, annotations, imported images, axis colors and SVG
artwork must retain their meaning. The WebGL viewport reads the canvas/grid palette
without recreating its renderer, camera or geometric model on a theme change.

Source CSS stays readable; production CSS minification belongs to the build pipeline,
not hand-minified component styles. No additional theme dependency or duplicate layout
stylesheet is required.
