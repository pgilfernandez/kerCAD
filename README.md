# eduCAD

CAD paramétrico en el navegador, local-first y open source, pensado para aprender diseño y fabricación digital.

eduCAD conserva el flujo directo de SketchForge —formas sencillas, botones grandes, arrastre sobre el plano e inspector visual— pero el documento no es una colección de mallas. Cada forma que el alumno añade crea por debajo un boceto y una operación CAD; la pieza completa se reconstruye con un núcleo OpenCascade B-Rep.

## Estado: MVP 0.1

El primer incremento permite:

- añadir cajas y cilindros desde el menú de formas, sin tener que conocer previamente el flujo de un CAD profesional;
- mover la forma seleccionada arrastrándola por el plano o con las flechas y editar sus cotas desde el inspector;
- cambiar una forma entre `Solid` y `Hole`, manteniendo una operación booleana paramétrica y editable;
- duplicar, copiar/pegar, ocultar, eliminar, deshacer y rehacer con la barra visual heredada de SketchForge;
- abrir cuando se necesite el historial educativo que revela el boceto y la extrusión creados por cada forma;
- crear bocetos rectangulares y circulares totalmente acotados en el plano XY;
- extruir como sólido nuevo, añadir material o quitar material;
- crear taladros pasantes o ciegos por posición y diámetro;
- redondear aristas verticales o todas las aristas;
- suprimir, eliminar y reordenar operaciones del historial;
- editar cualquier cota y reconstruir las operaciones posteriores;
- guardar automáticamente en el almacenamiento local del navegador;
- importar/exportar el documento paramétrico `.educad.json`;
- exportar el resultado como STEP B-Rep.

La triangulación solo se genera como representación visual para Three.js. La fuente de verdad y el archivo STEP se obtienen de la geometría B-Rep exacta.

## Arquitectura

```text
Documento JSON paramétrico
  └─ boceto → extrusión → taladro → redondeo
       └─ reconstrucción secuencial
            └─ brepjs + OpenCascade WASM (B-Rep exacto)
                 ├─ STEP
                 └─ triangulación temporal → visor Three.js
```

Piezas principales:

- `apps/web/src/types/parametric.ts`: esquema del documento y las operaciones.
- `apps/web/src/lib/parametricDocument.ts`: creación, validación y dependencias del historial.
- `apps/web/src/lib/parametricObjects.ts`: traducción entre la interacción sencilla de formas y las operaciones paramétricas.
- `apps/web/src/lib/parametricKernel.ts`: reconstrucción B-Rep, métricas, malla de visualización y STEP.
- `apps/web/src/components/SketchForgeParametricEditor.tsx`: entorno educativo compatible visualmente con el flujo de SketchForge.
- `apps/web/src/components/ParametricViewport.tsx`: visor Three.js; no contiene la geometría maestra.

## Flujo de aprendizaje

1. Pulsa `SHAPES` y añade una caja o un cilindro.
2. Arrastra la selección sobre el plano o usa las flechas para colocarla con precisión.
3. Cambia `Length`, `Width` y `Height` en el inspector de la derecha.
4. Elige `Solid` para aportar material o `Hole` para retirarlo.
5. Abre `HISTORY` para ver la idea CAD que hay debajo: **boceto → extrusión → combinación**.

La interfaz principal mantiene la baja barrera de entrada del proyecto de referencia. El historial no obliga al alumno a trabajar como un profesional desde el primer minuto: aparece como una segunda capa explicativa y permite comprobar que las formas siguen siendo paramétricas.

## Desarrollo local

Requisitos recomendados:

- Node.js 24 o posterior;
- npm;
- un navegador moderno con WebAssembly y WebGL 2.

```bash
npm install
npm run dev
```

Abre `http://127.0.0.1:3000`.

Verificación:

```bash
npm run typecheck
npm run test
npm run build
```

El núcleo OpenCascade pesa aproximadamente 22 MB y se carga de forma diferida la primera vez que se reconstruye una pieza. Después queda reutilizado durante la sesión.

## Modelo de documento

Los archivos de proyecto son JSON legible y versionado:

```json
{
  "schema": "educad-parametric/v1",
  "name": "Mi primera pieza paramétrica",
  "units": "mm",
  "features": [
    { "kind": "sketch", "profile": { "shape": "rectangle", "width": 80, "depth": 52 } },
    { "kind": "extrude", "sketchId": "…", "distance": 8, "operation": "new" },
    { "kind": "hole", "x": -25, "y": 0, "diameter": 12, "termination": "through-all" }
  ]
}
```

Los identificadores completos, nombres, estados de supresión y metadatos se incluyen en el archivo real.

## Siguiente hoja de ruta

- editor de bocetos interactivo con restricciones geométricas (horizontal, vertical, coincidencia, tangencia);
- selección persistente de caras y aristas mediante referencias topológicas estables;
- extrusión desde caras, vaciado, chaflán, revolución, patrón y simetría;
- múltiples cuerpos, ensamblajes y dibujos 2D;
- proyectos y secuencias didácticas compartibles por docentes;
- migración o retirada progresiva de los módulos legacy de SketchForge que no usa la nueva ruta principal.

## Origen y licencias

eduCAD deriva de [SketchForge 3D](https://github.com/Orbiter/SketchForge-3D-App), cuyo enfoque local-first y de aula sirve de base para la aplicación. SketchForge se distribuye bajo licencia MIT.

El núcleo paramétrico utiliza [brepjs](https://github.com/andymai/brepjs) y `occt-wasm`, basados en OpenCascade. Consulta las licencias de cada dependencia en sus respectivos paquetes.

Este repositorio se distribuye bajo la licencia MIT incluida en [LICENSE](LICENSE). Las contribuciones son bienvenidas.
