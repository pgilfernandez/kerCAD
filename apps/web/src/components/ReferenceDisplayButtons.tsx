import { kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import type { ParametricObject } from "@/types/parametric";

type DisplayMode = NonNullable<ParametricObject["referenceMesh"]>["displayMode"];

export function ReferenceDisplayButtons({ value, locale, onChange }: { value: DisplayMode; locale: KercadLocale; onChange: (mode: DisplayMode) => void }) {
  return <>{(["solid", "solidEdges", "wireframe"] as const).map((mode) => {
    const label = kercadTranslate(locale, `display.${mode}`);
    return <button key={mode} type="button" className={`toolbar-icon ${value === mode ? "active" : ""}`} aria-pressed={value === mode} aria-label={label} title={label} onClick={() => onChange(mode)}><img src={`/assets/kercad/toolbar-horizontal/display-${mode}.svg`} className="toolbar-command-icon" width={34} height={34} alt="" aria-hidden="true" draggable={false} /></button>;
  })}</>;
}
