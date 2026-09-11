# Shared eduCAD projects — first implementation

The dashboard shows **Shared** when `/api/educad-shared-projects` reports configured storage. This is a common file library for users of the server, not live collaborative editing or private student storage.

Run a development server with a persistent directory (macOS/Linux):

```sh
EDUCAD_SHARED_PROJECTS_DIR=/absolute/path/to/projects npm run dev -- --hostname 0.0.0.0 --port 3000
```

The existing Docker Compose environment variable `SKETCHFORGE_SHARED_PROJECTS_DIR` remains a fallback, preserving existing volume configuration. `.skf` files are left untouched; the separate eduCAD endpoint lists and validates only `.educad` packages.

1. Create or edit a local project and return to the dashboard.
2. Open **Shared**, select the local project and choose **Save to shared**.
3. Another browser can open it as a separate local copy.
4. Return to Shared to publish changes explicitly. A stale revision is rejected; save under another name or open the current server file as another local copy. Existing local work is preserved.

The server validates packages, bounds incoming data, uses atomic replacement and compares content revisions under a per-file lock. A request that cannot acquire the lock must never remove another writer's lock. Additional package assets are retained in local shared copies and subsequent shared saves.

## Verification and current limits

`npm test -- tests/unit/educadSharedProjects.test.ts` checks round trips, stale revisions, concurrent writes, lock ownership and invalid inputs.

Projects can be shared from the dashboard or directly from the editor. Shared preview images are not implemented yet. The directory is suitable for a single application server. An abnormal termination during a save can leave a `.educad.lock` file: stop all application writers and remove only that abandoned lock before restarting. Automatic lock recovery and metadata/listing performance for large libraries remain follow-up work. Back up `.educad` files before administering the directory.

Docker's Node version now matches the application's Node 24 requirement. A successful Docker build has not yet been verified; the prebuilt Compose still points to upstream SketchForge and must not be used to deploy eduCAD.

## Last modification

Shared cards display the server file's modification date/time and the name supplied with its last save. The sharing form remembers this name in the current browser after a successful save. This is user-entered attribution, not authenticated identity. Existing projects without attribution show “Author not provided”. Back up the `.authors` metadata directory along with project files if you want to preserve these labels.

Old project versions are **not** retained. Content revisions prevent stale overwrites; they are not recoverable snapshots. Attribution metadata alone cannot restore previous project contents.

## Delete a shared project

Choose **Delete shared** on its card and confirm. This permanently removes the server file for all users and cleans up its attribution metadata; local browser copies are not changed. Deletion requires the card's current revision and uses the same lock as saving. If someone updated the project or is saving it, deletion is rejected: refresh the library and review the project before confirming again. There are no account-based deletion permissions in this common server library.


## Save from the editor

Open **Export → Save to shared**, enter the shared file name and your name, then choose **Publish project**. The editor saves its current editable document locally before publishing. For projects opened from Shared, the original file name and revision are reused; conflicts keep the form open so you can choose another name. Your name is remembered after a successful save. This action is hidden when shared storage is unavailable or while authoring a challenge.
