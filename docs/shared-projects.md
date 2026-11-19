# Shared kerCAD projects — first implementation

The dashboard shows **Shared** when sharing is enabled. This is a common file library for users of the server, not live collaborative editing or private student storage.

No environment variable is required. Turn on **Shared projects** in Administration
to use `.local-data/shared-projects/` relative to the server's working directory.
kerCAD creates it on first use. This default location is not shared until you
enable it. Existing explicit directory settings and saved switch states are preserved.

Run a development server with a persistent directory (macOS/Linux):

```sh
KERCAD_SHARED_PROJECTS_DIR=/absolute/path/to/projects npm run dev -- --hostname 0.0.0.0 --port 3000
```

The existing Docker Compose environment variable `SKETCHFORGE_SHARED_PROJECTS_DIR` remains a fallback, preserving existing volume configuration. `.skf` files are left untouched; the separate kerCAD endpoint lists and validates only `.kercad` packages.

Use the **Shared projects** switch in `/admin` to disable or re-enable access without restarting the server. The switch preserves existing shared files and local copies and is stored with the other admin settings. It does not add authentication.

After setting an admin password or configuring `KERCAD_ADMIN_KEY`, sign in
and use **Shared projects folder** to override the environment setting without
restarting. Enter the absolute path of an existing directory writable by the
server. With Docker, use the path inside the container and mount the directory
there first. Clear and save the field to fall back to the environment setting,
or to the default folder if no environment setting exists.
Changing the folder does not move or delete files in the previous one.

To permanently empty the current shared library, turn off **Shared projects**
in Administration, then use **Delete all shared projects** and confirm.
Sign in if the panel is protected. If the panel is open without a password,
anyone who can reach it can also empty the shared library.
This does not affect local browser copies or other folders. If a project is
being modified or cannot be deleted, the result reports it as not deleted.

1. Create or edit a local project and return to the dashboard.
2. Choose **Save to shared** on the project card and confirm. kerCAD uses the project's existing name and author.
3. Another browser can open it as a separate local copy.
4. Use the same button on the local project card to publish changes explicitly. A stale revision is rejected; save under another name or open the current server file as another local copy. Existing local work is preserved.

The server validates packages, bounds incoming data, uses atomic replacement and compares content revisions under a per-file lock. A request that cannot acquire the lock must never remove another writer's lock. Additional package assets are retained in local shared copies and subsequent shared saves.

## Verification and current limits

`npm test -- tests/unit/kercadSharedProjects.test.ts` checks round trips, stale revisions, concurrent writes, lock ownership and invalid inputs.

Projects can be shared from the dashboard or directly from the editor. Shared cards display optional revision-matched previews. The directory is suitable for a single application server. New locks record their process ID and hostname. On a later attempt, the server can recover a lock if its owner is on the same host and the operating system reports that the process no longer exists. Live processes, permission errors, reused process IDs, legacy empty locks and different hosts never trigger automatic recovery. In those cases, stop all application writers and remove only a confirmed abandoned `.kercad.lock` file. A recreated Docker container may have a different hostname and therefore still require this manual procedure. Multiple replicas sharing the same directory are not supported. The listing caches content revisions using file identity, size and modification/change timestamps. Cache misses hash files in 64 KiB chunks, with four files processed per listing batch. The cache retains up to 512 entries; simultaneous requests for the same file reuse a pending hash. Thumbnail requests use the same cache. Saves and deletes still verify the current bytes under their lock. A changed or deleted file encountered mid-read is omitted from that listing and can appear on a subsequent refresh. Back up `.kercad` files before administering the directory.

Docker's Node version now matches the application's Node 24 requirement. A successful Docker build has not yet been verified. The prebuilt Compose requires `KERCAD_IMAGE` to identify an kerCAD image verified by the administrator; it no longer defaults to upstream SketchForge. See [deployment and backups](docker.md).

## Last modification

Shared cards display the server file's modification date/time and the name supplied with its last save. The sharing form remembers this name in the current browser after a successful save. This is user-entered attribution, not authenticated identity. Existing projects without attribution show “Author not provided”. Back up the `.authors` metadata directory along with project files if you want to preserve these labels.

Old project versions are **not** retained. Content revisions prevent stale overwrites; they are not recoverable snapshots. Attribution metadata alone cannot restore previous project contents.

## Delete a shared project

Choose **Delete shared** on its card and confirm. This permanently removes the server file for all users and cleans up its attribution metadata; local browser copies are not changed. Deletion requires the card's current revision and uses the same lock as saving. If someone updated the project or is saving it, deletion is rejected: refresh the library and review the project before confirming again. There are no account-based deletion permissions in this common server library.


## Save from the editor

Open **Export → Save to shared**, enter the shared file name and your name, then choose **Publish project**. The editor saves its current editable document locally before publishing. For projects opened from Shared, the original file name and revision are reused; conflicts keep the form open so you can choose another name. Your name is remembered after a successful save. This action is hidden when shared storage is unavailable or while authoring a challenge.


## Shared previews

The editor associates its generated JPEG preview with the captured document. Shared saves upload it only when it matches the document being published. Preview storage is optional: an image upload failure does not undo a successful project save. Older local thumbnails without a document association are not uploaded; reopen the project to generate a new one.

The server bounds preview uploads to 1 MiB, checks the saved project revision under the same lock as writes/deletes, and stores images in `.thumbnails`. A later project revision without an image shows a placeholder instead of its predecessor's preview. Deleting a shared project removes its previews. Include `.thumbnails` in backups if you want to retain them.


Lock recovery implementation was added without running tests or a build, as requested. This does not constitute verification of recovery after an actual crash.


The listing optimization was implemented without running tests, benchmarks or a build, as requested. Actual performance and external file replacement behavior remain unverified.
