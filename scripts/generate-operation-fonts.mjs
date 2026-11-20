// Regenerate the local typeface data used by the Text CAD operation.
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { TTFLoader } from "three/examples/jsm/loaders/TTFLoader.js";

const revision = "869789e84da92782c144d83d69b64cec54905b5f";
const sources = {
  fredoka: "Fredoka[wdth,wght].ttf",
  barlowcondensed: "BarlowCondensed-Bold.ttf",
  alfaslabone: "AlfaSlabOne-Regular.ttf",
  stardosstencil: "StardosStencil-Bold.ttf",
  oswald: "Oswald[wght].ttf",
  montserrat: "Montserrat-Regular.ttf",
  ubuntu: "Ubuntu-Regular.ttf",
  roboto: "Roboto[wdth,wght].ttf",
  pacifico: "Pacifico-Regular.ttf",
  gloriahallelujah: "GloriaHallelujah.ttf",
  greatvibes: "GreatVibes-Regular.ttf",
  amaticsc: "AmaticSC-Bold.ttf",
  worksans: "WorkSans-Regular.ttf",
  dmsans: "DMSans[opsz,wght].ttf",
  lora: "Lora[wght].ttf",
};
const variants = {
  montserrat: ["Montserrat-Bold", "Montserrat-Italic", "Montserrat-BoldItalic"],
  ubuntu: ["Ubuntu-Bold", "Ubuntu-Italic", "Ubuntu-BoldItalic"],
  worksans: ["WorkSans-Bold", "WorkSans-Italic", "WorkSans-BoldItalic"],
};
const extraVariants = {
  montserrat: { light: "Montserrat-Light.ttf" },
  ubuntu: { light: "Ubuntu-Light.ttf" },
  worksans: { light: "WorkSans-Light.ttf" },
  barlowcondensed: { light: "BarlowCondensed-Light.ttf", regular: "BarlowCondensed-Regular.ttf", italic: "BarlowCondensed-Italic.ttf", "bold-italic": "BarlowCondensed-BoldItalic.ttf" },
  amaticsc: { regular: "AmaticSC-Regular.ttf" },
  stardosstencil: { regular: "StardosStencil-Regular.ttf" },
  fredoka: { regular: ["Fredoka[wdth,wght].ttf", 400], bold: ["Fredoka[wdth,wght].ttf", 700] },
  oswald: { light: ["Oswald[wght].ttf", 300], bold: ["Oswald[wght].ttf", 700] },
  roboto: { light: ["Roboto[wdth,wght].ttf", 300], bold: ["Roboto[wdth,wght].ttf", 700], italic: ["Roboto-Italic[wdth,wght].ttf", 400], "bold-italic": ["Roboto-Italic[wdth,wght].ttf", 700] },
  dmsans: { light: ["DMSans[opsz,wght].ttf", 300], bold: ["DMSans[opsz,wght].ttf", 700], italic: ["DMSans-Italic[opsz,wght].ttf", 400], "bold-italic": ["DMSans-Italic[opsz,wght].ttf", 700] },
  lora: { bold: ["Lora[wght].ttf", 700], italic: ["Lora-Italic[wght].ttf", 400], "bold-italic": ["Lora-Italic[wght].ttf", 700] },
};
const output = new URL("../apps/web/src/lib/operation-fonts/", import.meta.url);
const notices = new URL("../apps/web/public/assets/kercad/font-licenses/", import.meta.url);
await Promise.all([mkdir(output, { recursive: true }), mkdir(notices, { recursive: true })]);
const loader = new TTFLoader();
const staticSources = {
  montserrat: "JulietaUla/Montserrat/555facfb2a18c72c3c0380f0d9c0f060453a9058",
  worksans: "weiweihuanghuang/Work-Sans/b35c81086186162164947bd39574683073d9b268",
};
const download = async (family, file) => {
  const root = family === "ubuntu" ? "ufl" : "ofl";
  const url = staticSources[family]
    ? `https://raw.githubusercontent.com/${staticSources[family]}/${file.endsWith(".ttf") ? "fonts/ttf/" : ""}${file}`
    : `https://raw.githubusercontent.com/google/fonts/${revision}/${root}/${family}/${encodeURIComponent(file)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${family}/${file}: HTTP ${response.status}`);
  return response;
};
// Variable faces need a static instance before Three.js can read their contours.
// Set KERCAD_FONT_PYTHON to a Python interpreter with fontTools installed.
function instantiateWeight(bytes, weight) {
  const script = [
    "import io,sys",
    "from fontTools.ttLib import TTFont",
    "from fontTools.varLib.instancer import instantiateVariableFont",
    "font=TTFont(io.BytesIO(sys.stdin.buffer.read()))",
    "axes={axis.axisTag:axis.defaultValue for axis in font['fvar'].axes}",
    "axes['wght']=int(sys.argv[1])",
    "out=io.BytesIO()",
    "instantiateVariableFont(font, axes, inplace=True).save(out)",
    "sys.stdout.buffer.write(out.getvalue())",
  ].join("\n");
  const result = spawnSync(process.env.KERCAD_FONT_PYTHON || "python3", ["-c", script, String(weight)], { input: Buffer.from(bytes), maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr.toString());
  return result.stdout.buffer.slice(result.stdout.byteOffset, result.stdout.byteOffset + result.stdout.byteLength);
}
async function generateTypeface(family, file, outputName, styleName, weight) {
  const bytes = await (await download(family, file)).arrayBuffer();
  const data = loader.parse(weight === undefined ? bytes : instantiateWeight(bytes, weight));
  data.original_font_information = { source: file };
  // Use an internal family name distinct from the original font's reserved names.
  data.familyName = family === "ubuntu" ? `Ubuntu derivative kerCAD${styleName ? " " + styleName : ""}` : `kerCAD Outline ${Object.keys(sources).indexOf(family) + 1}${styleName ? " " + styleName : ""}`;
  // Keep generated files diffable without expanding every outline token.
  const { glyphs, ...metrics } = data;
  const lines = Object.entries(glyphs).map(([name, glyph]) => `    ${JSON.stringify(name)}: ${JSON.stringify({
    ...glyph,
    x_min: Number.isFinite(glyph.x_min) ? glyph.x_min : 0,
    x_max: Number.isFinite(glyph.x_max) ? glyph.x_max : 0,
  })}`);
  const json = JSON.stringify(metrics, null, 2).replace(/\n}$/, `,\n  "glyphs": {\n${lines.join(",\n")}\n  }\n}\n`);
  await writeFile(new URL(`${outputName}.typeface.json`, output), json);
}
for (const [family, file] of Object.entries(sources)) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(family)) continue;
  const licenseFile = family === "ubuntu" ? "UFL.txt" : "OFL.txt";
  const license = await (await download(family, licenseFile)).text();
  await writeFile(new URL(`${family}.${licenseFile}`, notices), license.split(/\r?\n/).map((line) => line.trimEnd()).join("\n").trimEnd() + "\n");
  await generateTypeface(family, file, family, "");
  await Promise.all((variants[family] ?? []).map((name, index) => {
    const style = ["bold", "italic", "bold-italic"][index];
    return generateTypeface(family, `${name}.ttf`, `${family}-${style}`, style);
  }));
  await Promise.all(Object.entries(extraVariants[family] ?? {}).map(([style, source]) => {
    const [name, weight] = Array.isArray(source) ? source : [source];
    return generateTypeface(family, name, `${family}-${style}`, style, weight);
  }));
}
