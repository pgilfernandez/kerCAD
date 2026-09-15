# eduCAD

CAD paramétrico en el navegador, local-first y open source, pensado para aprender diseño y fabricación digital.

eduCAD conserva el flujo directo de SketchForge —formas sencillas, botones grandes, arrastre sobre el plano e inspector visual— pero el documento no es una colección de mallas. Cada objeto es un contenedor de transformación y su geometría procede de una secuencia de operaciones CAD reconstruida con un núcleo OpenCascade B-Rep.

## Qué puedes hacer

El editor permite:

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
- guardar y reabrir paquetes `.educad` con el documento paramétrico y sus recursos;
- exportar el resultado como STEP B-Rep o STL para fabricación;
- trabajar con extrusión de caras, vaciado, revolución, simetría y patrones lineales o polares;
- colocar un plano de trabajo, dejar caer piezas sobre él y alinear objetos u operaciones respecto a una referencia o al grupo;
- crear y seguir Retos con instrucciones y recursos, importarlos y exportarlos como ZIP;
- publicar proyectos en una biblioteca compartida cuando el servidor tiene almacenamiento configurado.

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

1. Desde el dashboard, crea o abre un proyecto privado, o entra en Retos para seguir una actividad.
2. Crea un objeto y añade formas o un boceto que puedas extruir.
3. Selecciona una operación en el árbol para cambiar sus dimensiones. Las operaciones posteriores se reconstruyen a partir de esos cambios.
4. Coloca las piezas con los manipuladores, el plano de trabajo y la herramienta de alineación.
5. Exporta `.educad` para continuar el diseño en otro equipo, STEP para intercambio CAD o STL para imprimir.

La interfaz principal mantiene la baja barrera de entrada del proyecto de referencia. Seleccionar el objeto permite editar únicamente posición, rotación y escala; seleccionar la primera operación permite cambiar las dimensiones de la caja o el cilindro. Los perfiles técnicos internos necesarios para construir el B-Rep no se duplican en el árbol del alumno.

## Retos para profesores

1. Crea una actividad en Retos y prepara sus instrucciones, imágenes y modelo inicial cuando proceda.
2. Exporta el reto como ZIP y distribúyelo mediante el aula virtual, o coloca el paquete en la biblioteca del servidor.
3. Los alumnos importan o abren el reto y trabajan en proyectos locales independientes.
4. Para entregar su trabajo editable, exportan su proyecto `.educad`.

El profesor sigue creando y editando localmente; el servidor distribuye los ZIP. Una actualización de un reto del servidor no sobrescribe automáticamente una actividad local con el mismo identificador. Consulta [configuración de la biblioteca y actualizaciones](docs/classroom-challenges.md).

## Dónde se guardan los proyectos

**Mis proyectos** utiliza el almacenamiento del navegador. Cambiar de navegador o equipo no traslada esos datos; borrar los datos del sitio puede eliminarlos. Exporta regularmente los proyectos importantes como `.educad`, especialmente en equipos compartidos del aula.

**Compartidos** aparece cuando el servidor dispone de una biblioteca configurada. Abrir un proyecto compartido crea una copia local; publicar los cambios es una acción explícita desde el dashboard o desde Exportar. El control de revisiones rechaza sobrescrituras si otra persona ha guardado entretanto y permite conservar el trabajo con otro nombre.

Es una biblioteca común, sin cuentas, permisos individuales ni edición simultánea. La fecha y el autor muestran la última modificación; el nombre lo introduce el usuario y se recuerda en ese navegador. **No se conservan versiones antiguas recuperables en el servidor.** Borrar un compartido lo elimina para todos, aunque las copias locales permanecen. Consulta [guardado, conflictos, borrado y copias](docs/shared-projects.md).

## Desarrollo local

Para distribución en el aula, consulta [Docker: configuración, persistencia y copias de seguridad](docs/docker.md), [proyectos compartidos](docs/shared-projects.md) y [distribución de Retos](docs/classroom-challenges.md). La adaptación Docker está pendiente de validación; no hay una imagen propia comprobada ni un DMG validado en esta fase.

Requisitos recomendados:

- Node.js 24 o posterior;
- npm;
- un navegador moderno con WebAssembly y WebGL 2.

```bash
npm ci
npm run dev
```

Abre `http://127.0.0.1:3000`.

Para que otros equipos de la red accedan al servidor de desarrollo:

```sh
npm run dev -- --hostname 0.0.0.0
```

Abre `http://IP_DEL_SERVIDOR:3000` desde esos equipos. Para habilitar bibliotecas persistentes en macOS/Linux, crea los directorios y arranca con rutas absolutas:

```sh
EDUCAD_SHARED_PROJECTS_DIR=/ruta/absoluta/proyectos EDUCAD_CHALLENGES_DIR=/ruta/absoluta/retos npm run dev -- --hostname 0.0.0.0
```

El uso privado y la importación manual de Retos no requieren activar la biblioteca compartida.

Comandos de verificación disponibles para desarrollo (su presencia no certifica una distribución):

```bash
npm run typecheck
npm run test
npm run test:browser
npm run build
```

La matriz automatizada y las comprobaciones manuales recomendadas para Chrome/Edge, Android, Safari/iPadOS y Firefox se describen en [Browser and device compatibility](docs/browser-compatibility.md).

El núcleo OpenCascade pesa aproximadamente 22 MB y se carga de forma diferida la primera vez que se reconstruye una pieza. Después queda reutilizado durante la sesión.

## Modelo de documento

El archivo `.educad` es un paquete ZIP que contiene el documento paramétrico versionado y los recursos necesarios para reabrirlo. El JSON del historial sigue siendo la fuente de verdad; STL contiene geometría triangulada y no sustituye esa copia editable. El siguiente fragmento ilustra el documento interno, no un paquete completo importable:

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

## Distribución y próximos pasos

- Docker: configuración adaptada a eduCAD; pendientes construcción real, comprobación desde la LAN, restauración y validación amd64/arm64. El Compose precompilado requiere una imagen propia comprobada por el administrador.
- macOS: existen herramientas heredadas de empaquetado, pero todavía no se ofrece una aplicación o DMG eduCAD validado y autocontenido.
- Exportación de selección: pendiente permitir exportar una pieza elegida a STEP/STL; `.educad` conserva el proyecto completo.
- La exportación estática y la integración MCP heredada no son vías soportadas del editor paramétrico actual.

No se incluyen cuentas, calificaciones, entregas centralizadas ni colaboración en directo. El aula virtual del centro puede seguir gestionando las entregas y la evaluación.

## Origen y licencias

Este checkout procede del repositorio `Orbiter/SketchForge-3D-App`. Su historial local comienza en `0dbefbd` y el primer incremento paramétrico eduCAD está en `8e11cb9`; eso no identifica por sí solo un commit equivalente del upstream original. El archivo LICENSE de este checkout contiene la licencia MIT y conserva atribuciones a SketchForge y eduCAD. Antes de incorporar cambios de otro upstream, queda pendiente contrastar su revisión concreta y licencia; no se presupone que coincidan con las de este checkout.

El núcleo paramétrico utiliza [brepjs](https://github.com/andymai/brepjs) y `occt-wasm`, basados en OpenCascade. Consulta las licencias de cada dependencia en sus respectivos paquetes.

Este repositorio se distribuye bajo la licencia MIT incluida en [LICENSE](LICENSE). Las contribuciones son bienvenidas.
