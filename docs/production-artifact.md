# Artefacto de servidor para validar producción

El workflow `CI` incluye un job independiente, `Production server artifact (Linux x64)`. La configuración está preparada, pero todavía no se ha ejecutado ni validado en este incremento. Un resultado verde del job será evidencia de construcción y arranque básico, no de funcionamiento completo del CAD.

En cada push, pull request o ejecución manual del workflow, el job:

1. Instala dependencias con Node 24 y construye el servidor standalone.
2. Empaqueta servidor, dependencias trazadas, assets del navegador, núcleo OCCT y carpeta de Retos disponible en el checkout.
3. Copia el paquete fuera del repositorio y comprueba `/api/health` y la respuesta de la página principal, escuchando solo en loopback durante esa comprobación.
4. Genera un archivo TAR.GZ y su SHA-256, identificados por commit, y conserva el log de arranque.

El TAR mantiene los permisos y enlaces de las dependencias. `build-info.json` registra commit, repositorio, ejecución, Node, plataforma y arquitectura. Los artefactos duran 14 días; los logs, 7. Son materiales de validación, no publicaciones permanentes.

## Abrir el artefacto

Descarga el artefacto del job correspondiente al commit que quieras revisar. Tras extraer el ZIP de GitHub Actions, en Linux x64 con Node 24:

```sh
sha256sum -c educad-server-linux-x64.tar.gz.sha256
tar -xzf educad-server-linux-x64.tar.gz
cd educad-server
HOSTNAME=127.0.0.1 PORT=3000 node apps/web/server.js
```

Abre `http://127.0.0.1:3000`. Para validación desde otro equipo, cambia `HOSTNAME` a `0.0.0.0`. Las bibliotecas opcionales se configuran mediante rutas absolutas en `EDUCAD_SHARED_PROJECTS_DIR` y `EDUCAD_CHALLENGES_DIR`; conserva esos directorios fuera de la carpeta que reemplazas al actualizar.

Este paquete necesita Node externo y contiene dependencias nativas para Linux x64. No es una aplicación macOS, un DMG ni un paquete portable a arm64 o Alpine. Para contenedores utiliza la [configuración Docker](docker.md), que instala sus propias dependencias de destino.

Solo se incluyen archivos disponibles en el checkout de CI. Los ZIP de Retos que permanezcan sin trackear en el equipo del desarrollador no se distribuyen automáticamente.

## Validación que sigue pendiente

La respuesta HTTP inicial no ejecuta WebGL ni reconstruye piezas. Quedan por comprobar en navegador los workers y WASM, guardado/reapertura `.educad`, STEP/STL, exportación de selección y Retos. Persistencia, conflictos entre clientes, actualización/restauración y arranque Docker amd64/arm64 siguen teniendo criterios propios en el plan local. Este job no publica imágenes ni habilita por sí solo el trabajo de empaquetado macOS.
