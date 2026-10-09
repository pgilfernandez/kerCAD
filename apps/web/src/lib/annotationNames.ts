import type { ParametricAnnotation } from "@/types/parametric";

export function nextAnnotationName(annotations: ParametricAnnotation[], base: string) {
  const used = new Set(annotations.map((annotation) => annotation.name));
  let number = 1;
  for (const name of used) {
    if (!name.startsWith(`${base} `)) continue;
    const suffix = Number(name.slice(base.length + 1));
    if (Number.isInteger(suffix) && suffix >= number) number = suffix + 1;
  }
  while (used.has(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}
