# Docker para el aula

Configuración adaptada a eduCAD, pendiente de construcción y validación real. No hay una imagen precompilada validada que esta guía pueda recomendar. No se han comprobado aún exportaciones remotas, restauración ni las dos arquitecturas.

## Construcción local

Desde la raíz del repositorio, con Docker y Compose disponibles:

```sh
npm run docker:up
```

Abre `http://IP_DEL_SERVIDOR:3000` desde el aula. `EDUCAD_PORT` permite cambiar el puerto externo; `SKETCHFORGE_PORT` sigue siendo un alias. Para servir en el puerto 80, usa `EDUCAD_PORT=80`; el contenedor escucha en 3000 y ya no arranca el proxy interno heredado. El proceso usa el usuario `node`, sin privilegios de root, y Compose configura reinicio automático.

La imagen instala Node 24 y dependencias para la arquitectura de destino, genera los assets OCCT durante la construcción y ejecuta el servidor standalone. `/api/health` comprueba que responde el servidor, independientemente de las bibliotecas opcionales. No certifica que el núcleo CAD funcione en el navegador.

## Persistencia y migración

Los compartidos se guardan en `/data/projects`, mediante `EDUCAD_SHARED_PROJECTS_DIR`. La API también conserva el alias `SKETCHFORGE_SHARED_PROJECTS_DIR` fuera de esta configuración; si existen ambos, prevalece el de eduCAD. El contenedor configura explícitamente el primero.

Compose mantiene por defecto el nombre histórico del volumen: `<proyecto-compose>_sketchforge-shared-projects` (normalmente `docker_sketchforge-shared-projects`). Antes de sustituir un despliegue existente, consulta su montaje real:

```sh
docker compose -f deploy/docker/compose.yaml ps -a
docker volume ls
docker inspect ID_DEL_CONTENEDOR --format '{{json .Mounts}}'
```

Configura `EDUCAD_SHARED_PROJECTS_VOLUME` con el nombre exacto del volumen existente. También se acepta `SKETCHFORGE_SHARED_PROJECTS_VOLUME`. Estas variables identifican volúmenes Docker; para un directorio del host, utiliza un override de Compose que monte ese directorio en `/data/projects`, con permisos para UID 1000. No se trasladan archivos automáticamente.

El servicio cambia de `sketchforge` a `educad`: detén el anterior antes de arrancar el nuevo para liberar el puerto y evitar dos servidores sobre la misma biblioteca. Conserva el nombre del proyecto Compose, especialmente si antes usabas `-p`. No uses `down -v` al actualizar.

`npm run docker:run` conserva el volumen histórico sin prefijo `sketchforge-shared-projects`, diferente del predeterminado de Compose. Para pasar de ese comando a Compose, establece `EDUCAD_SHARED_PROJECTS_VOLUME=sketchforge-shared-projects`.

Los Retos se montan aparte, en `/data/challenges`, de solo lectura. `EDUCAD_CHALLENGES_VOLUME` acepta un directorio absoluto del host; consulta [distribución de Retos](classroom-challenges.md). Los volúmenes existentes no reciben automáticamente los nuevos ZIP de una imagen. Los ejemplos locales no trackeados tampoco aparecerán en una construcción desde GitHub.

Los proyectos privados del navegador no están en estos volúmenes: expórtalos como `.educad`. La biblioteca compartida es común a quienes acceden al servidor, sin cuentas ni edición simultánea.

## Copia de seguridad y restauración

Detén el servicio durante la copia para conservar proyectos, revisiones y miniaturas conjuntamente. Ejemplo con el volumen predeterminado; sustituye su nombre por el montaje real:

```sh
docker compose -f deploy/docker/compose.yaml stop educad
mkdir -p backups
docker run --rm -v docker_sketchforge-shared-projects:/source:ro -v "$PWD/backups:/backup" alpine:3.22 tar czf /backup/projects.tgz -C /source .
docker compose -f deploy/docker/compose.yaml start educad
```

Copia también la biblioteca de Retos: repite el procedimiento con su volumen, o copia el directorio del host. Guarda los archivos de respaldo fuera del servidor y conserva la configuración y versión de la imagen.

Restaura primero en un volumen nuevo, sin sobrescribir la biblioteca actual:

```sh
docker volume create educad-projects-restored
docker run --rm -v educad-projects-restored:/target -v "$PWD/backups:/backup:ro" alpine:3.22 tar xzpf /backup/projects.tgz -C /target
EDUCAD_SHARED_PROJECTS_VOLUME=educad-projects-restored docker compose -f deploy/docker/compose.yaml up -d
```

Mantén esa variable en los siguientes arranques. La copia preserva los propietarios de los archivos. Verifica manualmente listado, apertura y guardado antes de adoptar la restauración.

## Versiones y vuelta atrás

`compose-ghcr.yaml` exige `EDUCAD_IMAGE`: una etiqueta o digest de una imagen eduCAD previamente construida y comprobada por el administrador. No descarga SketchForge ni presupone que ya exista una publicación propia.

```sh
docker compose -f deploy/docker/compose-ghcr.yaml pull
docker compose -f deploy/docker/compose-ghcr.yaml up -d
```

Antes de actualizar, registra la referencia exacta de la imagen anterior y realiza una copia. Para volver atrás, configura `EDUCAD_IMAGE` con esa referencia y recrea el servicio con los mismos volúmenes. Si una futura versión cambia el formato de datos, restaura la copia compatible en otro volumen. La CI existente publica para amd64/arm64 y ahora configura emulación para instalar dependencias nativas; esto sigue pendiente de validación y no se ha ejecutado ni publicado durante este cambio.
