# Loading popup sponsor images

Place sponsor images directly in this folder:

`apps/web/public/assets/kercad/sponsors/`

- Accepted formats: WebP, AVIF, PNG, JPG/JPEG, GIF and SVG.
- Recommended proportions: 2:1, e.g. **960 × 480 px**.
- For quick loading, prefer WebP/AVIF and keep files around 100–200 KB when possible.
- No manifest or code edits are needed. The server discovers the files, and the
  browser chooses a random available image for each project-loading popup.
- The next image is downloaded and decoded while the project list or the current
  project is visible. The popup never waits for an image to finish loading.
- Newly added images are picked up as the client refreshes the catalogue (cached
  in memory for up to 30 seconds). Refresh the page to fetch it immediately.
- Broken images are skipped. If there are no usable images, the built-in kerCAD
  artwork is used instead, without caching it as a sponsor. Adding the first
  image is discovered when the next loading popup prepares its campaign.
- Remove an image to stop using it. Do not put private material here: everything
  in `public/` is publicly accessible. Uploaded SVGs must be trusted artwork.

Development reads this folder directly. A packaged/Docker deployment includes
the images present when it is built; replace the deployed public folder or
rebuild the package to distribute subsequent additions.
