import type { FontData } from "three/examples/jsm/loaders/FontLoader.js";
import sans from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import serif from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import script from "three/examples/fonts/gentilis_bold.typeface.json";
import mono from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import rounded from "three/examples/fonts/optimer_bold.typeface.json";

// One catalog for solid text and annotation font selectors.
export const textFonts = {
  Sans: { geometry: sans as FontData, family: "Arial, sans-serif" },
  Serif: { geometry: serif as FontData, family: "Georgia, serif" },
  Script: { geometry: script as FontData, family: '"Palatino Linotype", Palatino, serif' },
  Monospace: { geometry: mono as FontData, family: '"Courier New", monospace' },
  Rounded: { geometry: rounded as FontData, family: '"Trebuchet MS", sans-serif' },
};
export const textFontNames = Object.keys(textFonts) as Array<keyof typeof textFonts>;
export function annotationFontFamily(name: string) {
  return textFonts[name as keyof typeof textFonts]?.family ?? name;
}
