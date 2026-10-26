# Docker para el aula

Configuración adaptada a kerCAD, pendiente de construcción y validación real. No hay una imagen precompilada validada que esta guía pueda recomendar. No se han comprobado aún exportaciones remotas, restauración ni las dos arquitecturas.

## Construcción local

Desde la raíz del repositorio, con Docker y Compose disponibles:

```sh
npm run docker:up
```

`npm run docker:up` y `npm run docker:build` obtienen el commit del repositorio y lo
pasan como argumento de construcción `KERCAD_COMMIT`. El popup de información
muestra `0.9 (abcdef1)` con la revisión de esa imagen, sin incluir `.git` ni instalar
Git en el contenedor. Los workflows de publicación y validación pasan igualmente
el SHA del checkout. Cambiar esta variable al arrancar una imagen ya construida no
modifica su versión: el identificador se incorpora durante la compilación.

Si usas Docker o Compose directamente, indica la revisión explícitamente:

```sh
docker build --build-arg KERCAD_COMMIT="$(git rev-parse HEAD)" -f deploy/docker/Dockerfile -t kercad:local .
KERCAD_COMMIT="$(git rev-parse HEAD)" docker compose -f deploy/docker/compose.yaml up --build -d
```

Para compilar desde una copia sin Git, define `KERCAD_COMMIT` con el hash de origen
antes de ejecutar los comandos npm. Sin una revisión disponible, se muestra `—`
en lugar de inventar un identificador.

Abre `http://IP_DEL_SERVIDOR:3000` desde el aula. `KERCAD_PORT` permite cambiar el puerto externo; `SKETCHFORGE_PORT` sigue siendo un alias. Para servir en el puerto 80, usa `KERCAD_PORT=80`; el contenedor escucha en 3000 y ya no arranca el proxy interno heredado. El proceso usa el usuario `node`, sin privilegios de root, y Compose configura reinicio automático.

La imagen instala Node 24 y dependencias para la arquitectura de destino, genera los assets OCCT durante la construcción y ejecuta el servidor standalone. `/api/health` comprueba que responde el servidor, independientemente de las bibliotecas opcionales. No certifica que el núcleo CAD funcione en el navegador.

## Persistencia y migración

Los compartidos se guardan en `/data/projects`, mediante `KERCAD_SHARED_PROJECTS_DIR`. La API también conserva el alias `SKETCHFORGE_SHARED_PROJECTS_DIR` fuera de esta configuración; si existen ambos, prevalece el de kerCAD. El contenedor configura explícitamente el primero.

Compose mantiene por defecto el nombre histórico del volumen: `<proyecto-compose>_sketchforge-shared-projects` (normalmente `docker_sketchforge-shared-projects`). Antes de sustituir un despliegue existente, consulta su montaje real:

```sh
docker compose -f deploy/docker/compose.yaml ps -a
docker volume ls
docker inspect ID_DEL_CONTENEDOR --format '{{json .Mounts}}'
```

Configura `KERCAD_SHARED_PROJECTS_VOLUME` con el nombre exacto del volumen existente. También se acepta `SKETCHFORGE_SHARED_PROJECTS_VOLUME`. Estas variables identifican volúmenes Docker; para un directorio del host, utiliza un override de Compose que monte ese directorio en `/data/projects`, con permisos para UID 1000. No se trasladan archivos automáticamente.

El servicio cambia de `sketchforge` a `kercad`: detén el anterior antes de arrancar el nuevo para liberar el puerto y evitar dos servidores sobre la misma biblioteca. Conserva el nombre del proyecto Compose, especialmente si antes usabas `-p`. No uses `down -v` al actualizar.

`npm run docker:run` conserva el volumen histórico sin prefijo `sketchforge-shared-projects`, diferente del predeterminado de Compose. Para pasar de ese comando a Compose, establece `KERCAD_SHARED_PROJECTS_VOLUME=sketchforge-shared-projects`.

Los Retos se montan aparte, en `/data/challenges`, de solo lectura. `KERCAD_CHALLENGES_VOLUME` acepta un directorio absoluto del host; consulta [distribución de Retos](classroom-challenges.md). Los volúmenes existentes no reciben automáticamente los nuevos ZIP de una imagen. Los ejemplos locales no trackeados tampoco aparecerán en una construcción desde GitHub.

Los proyectos privados del navegador no están en estos volúmenes: expórtalos como `.kercad`. La biblioteca compartida es común a quienes acceden al servidor, sin cuentas ni edición simultánea.

## Copia de seguridad y restauración

Detén el servicio durante la copia para conservar proyectos, revisiones y miniaturas conjuntamente. Ejemplo con el volumen predeterminado; sustituye su nombre por el montaje real:

```sh
docker compose -f deploy/docker/compose.yaml stop kercad
mkdir -p backups
docker run --rm -v docker_sketchforge-shared-projects:/source:ro -v "$PWD/backups:/backup" alpine:3.22 tar czf /backup/projects.tgz -C /source .
docker compose -f deploy/docker/compose.yaml start kercad
```

Copia también la biblioteca de Retos: repite el procedimiento con su volumen, o copia el directorio del host. Guarda los archivos de respaldo fuera del servidor y conserva la configuración y versión de la imagen.

Restaura primero en un volumen nuevo, sin sobrescribir la biblioteca actual:

```sh
docker volume create kercad-projects-restored
docker run --rm -v kercad-projects-restored:/target -v "$PWD/backups:/backup:ro" alpine:3.22 tar xzpf /backup/projects.tgz -C /target
KERCAD_SHARED_PROJECTS_VOLUME=kercad-projects-restored docker compose -f deploy/docker/compose.yaml up -d
```

Mantén esa variable en los siguientes arranques. La copia preserva los propietarios de los archivos. Verifica manualmente listado, apertura y guardado antes de adoptar la restauración.

## Versiones y vuelta atrás

### Validación manual en CI

El workflow `Validate Docker distribution` se ejecuta explícitamente desde GitHub Actions. Construye y arranca por separado amd64 y arm64 (arm64 mediante emulación), sin publicar imágenes. Comprueba el usuario sin privilegios, arranque, página principal, bibliotecas y descarga de WASM. Recrea el contenedor sobre el mismo volumen para comprobar que conserva un archivo de control y que el servidor sigue saludable con compartidos desactivado. Guarda logs y metadatos de contenedor/imagen durante 14 días.

Esta configuración todavía no se ha ejecutado. El archivo de control verifica persistencia del montaje, no un ciclo real de guardar/reabrir proyectos. Tampoco sustituye las pruebas de reconstrucción CAD en navegador, exportaciones, conflictos, restauración de copias o rendimiento en hardware arm64. La publicación existente sigue siendo un workflow independiente; este job manual no la bloquea ni la certifica automáticamente.

### Imagen precompilada

`compose-ghcr.yaml` exige `KERCAD_IMAGE`: una etiqueta o digest de una imagen kerCAD previamente construida y comprobada por el administrador. No descarga SketchForge ni presupone que ya exista una publicación propia.

```sh
docker compose -f deploy/docker/compose-ghcr.yaml pull
docker compose -f deploy/docker/compose-ghcr.yaml up -d
```

Antes de actualizar, registra la referencia exacta de la imagen anterior y realiza una copia. Para volver atrás, configura `KERCAD_IMAGE` con esa referencia y recrea el servicio con los mismos volúmenes. Si una futura versión cambia el formato de datos, restaura la copia compatible en otro volumen. La CI existente publica para amd64/arm64 y ahora configura emulación para instalar dependencias nativas; esto sigue pendiente de validación y no se ha ejecutado ni publicado durante este cambio.
