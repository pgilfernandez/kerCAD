# Iconos del árbol de operaciones

SVG editables utilizados por las filas del panel lateral derecho.

- `sketch.svg`: boceto.
- `box.svg`, `cylinder.svg`, `text.svg`: extrusión según su perfil; `box.svg` también identifica objetos y extrusión de cara.
- `circle.svg`: primitivas.
- `add.svg`, `cut.svg`, `common.svg`: indicadores de modo sobre el icono de operación.
- `imported-step.svg`: STEP y objetos de referencia.
- `hole.svg`, `fillet.svg`, `chamfer.svg`, `shell.svg`, `revolve.svg`, `mirror.svg`: operaciones correspondientes.
- `linear-pattern.svg`, `polar-pattern.svg`, `boolean.svg`: patrones y booleana entre objetos.
- `visible.svg`, `hidden.svg`, `suppressed.svg`: visibilidad y supresión.
- `locked.svg`, `unlocked.svg`: bloqueo del objeto.
- `expanded.svg`, `collapsed.svg`: desplegar y plegar el objeto.

Los SVG monocromos se muestran como máscaras CSS para conservar los colores de
estado, selección y tema. Se puede editar su geometría directamente; el color se
controla en `globals.css`. `shell.svg` y `revolve.svg` se muestran como imágenes y
conservan sus colores internos. Los nombres accesibles se asignan en React según
el idioma y la operación. Los símbolos monocromos proceden de Lucide (ISC).
