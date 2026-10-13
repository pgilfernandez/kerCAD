"use client";
import { SketchToolMenu } from "@/components/SketchToolMenu";
import { AnnotationIcon } from "@/components/AnnotationIcon";
import { annotationEndings } from "@/lib/annotationEndings";
import { educadTranslate, type EducadLocale } from "@/lib/educadI18n";
import type { AnnotationEnding } from "@/types/parametric";

export function AnnotationEndSelector({ side, value, locale, onChange }: { side: "start" | "end"; value: AnnotationEnding; locale: EducadLocale; onChange: (value: AnnotationEnding) => void }) {
  return <SketchToolMenu initialTool="arrow2" activeTool={value} onChoose={onChange} options={annotationEndings.map((tool) => ({ tool, label: educadTranslate(locale, `annotation.ending.${tool}`), icon: tool === "none" ? "line-start-end-none" : `line-${side}-${tool}` }))} renderIcon={(option) => <AnnotationIcon size={34} kind={option.icon as Parameters<typeof AnnotationIcon>[0]["kind"]} />} />;
}
