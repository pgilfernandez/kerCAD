// Regenerate the local typeface data used by the Text CAD operation.
import { mkdir, writeFile } from "node:fs/promises";
import { TTFLoader } from "three/examples/jsm/loaders/TTFLoader.js";

const revision = "869789e84da92782c144d83d69b64cec54905b5f";
const sources = {
  fredoka: "Fredoka[wdth,wght].ttf",
  barlowcondensed: "BarlowCondensed-Bold.ttf",
  alfaslabone: "AlfaSlabOne-Regular.ttf",
  stardosstencil: "StardosStencil-Bold.ttf",
};
const output = new URL("../apps/web/src/lib/operation-fonts/", import.meta.url);
const notices = new URL("../apps/web/public/assets/kercad/font-licenses/", import.meta.url);
await Promise.all([mkdir(output, { recursive: true }), mkdir(notices, { recursive: true })]);
const loader = new TTFLoader();
const download = async (family, file) => {
  const response = await fetch(`https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${family}/${encodeURIComponent(file)}`);
  if (!response.ok) throw new Error(`${family}/${file}: HTTP ${response.status}`);
  return response;
};
for (const [family, file] of Object.entries(sources)) {
  const data = loader.parse(await (await download(family, file)).arrayBuffer());
  const license = await (await download(family, "OFL.txt")).text();
  data.original_font_information = { source: file };
  // Use an internal family name distinct from the original font's reserved names.
  data.familyName = `kerCAD Outline ${Object.keys(sources).indexOf(family) + 1}`;
  // Keep generated files diffable without expanding every outline token.
  const { glyphs, ...metrics } = data;
  const lines = Object.entries(glyphs).map(([name, glyph]) => `    ${JSON.stringify(name)}: ${JSON.stringify({
    ...glyph,
    x_min: Number.isFinite(glyph.x_min) ? glyph.x_min : 0,
    x_max: Number.isFinite(glyph.x_max) ? glyph.x_max : 0,
  })}`);
  const json = JSON.stringify(metrics, null, 2).replace(/\n}$/, `,\n  "glyphs": {\n${lines.join(",\n")}\n  }\n}\n`);
  await writeFile(new URL(`${family}.typeface.json`, output), json);
  await writeFile(new URL(`${family}.OFL.txt`, notices), license.split(/\r?\n/).map((line) => line.trimEnd()).join("\n").trimEnd() + "\n");
}
