# Editable kerCAD icons

- `toolbar-3d/`: main 3D tools, including shapes and annotation creation.
- `toolbar-sketch/`: sketch drawing and editing tools.
- `toolbar-vertical/`: camera, visibility, grid and snapping controls; sketch constraints are in `constraints/`.
- `toolbar-horizontal/`: contextual editing controls, annotation settings and horizontal scroll indicators.
- `operations-tree/`: hierarchy entries and their state controls.
- `alignment/`: alignment picker artwork, kept unchanged.

Shared icons have one location according to their primary role. Header, project library, branding and ground-label artwork remain in this directory. Dynamic operation and annotation paths are centralized in `src/lib/kercadIconPaths.ts`.
