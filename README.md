# eduCAD

CAD paramétrico en el navegador, local-first y open source, pensado para aprender diseño y fabricación digital.

eduCAD conserva el flujo directo de SketchForge —formas sencillas, botones grandes, arrastre sobre el plano e inspector visual— pero el documento no es una colección de mallas. Cada objeto es un contenedor de transformación y su geometría procede de una secuencia de operaciones CAD reconstruida con un núcleo OpenCascade B-Rep.

## Estado: MVP 0.1

El primer incremento permite:

- crear primero un contenedor con `New Object` y añadir después cajas o cilindros como operaciones del objeto activo;
- mover la forma seleccionada arrastrándola por el plano o con las flechas y editar sus cotas desde el inspector;
- cambiar una operación entre `Añadir`, `Hueco` y `Común`, manteniendo una booleana paramétrica y editable;
- duplicar, copiar/pegar, ocultar, eliminar, deshacer y rehacer con la barra visual heredada de SketchForge;
- desplegar en el panel derecho cada objeto como un árbol CAD: `Objeto (transformación) → Caja/Cilindro → modificadores`;
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
  └─ objeto (posición, rotación, escala)
       └─ caja/cilindro → taladro → redondeo
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

1. Pulsa `SHAPES → New Object` para crear un contenedor vacío.
2. Selecciona el objeto —o cualquiera de sus operaciones— y añade una caja o un cilindro desde `SHAPES`.
3. Arrastra el objeto sobre el plano o usa las flechas para colocarlo con precisión.
4. Cambia las dimensiones y el modo aditivo/sustractivo seleccionando la operación en el árbol.
5. Despliega el objeto en `MODELO` para editar la secuencia **Caja/Cilindro → modificadores**.

La interfaz principal mantiene la baja barrera de entrada del proyecto de referencia. Seleccionar el objeto permite editar únicamente posición, rotación y escala; seleccionar la primera operación permite cambiar las dimensiones de la caja o el cilindro. Los perfiles técnicos internos necesarios para construir el B-Rep no se duplican en el árbol del alumno.

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
