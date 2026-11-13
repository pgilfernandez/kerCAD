"use client";
import { platonicTypes, type PlatonicType } from "@/lib/platonicSolids";
import { uiText, type KercadLocale } from "@/lib/kercadI18n";

export function PlatonicTypeButtons({ value, locale, onChange }: { value: PlatonicType; locale: KercadLocale; onChange: (value: PlatonicType) => void }) {
  return <div className="kercad-platonic-type-buttons" role="group" aria-label={uiText("platonic.type", {}, locale)}>
    {platonicTypes.map((type) => <button key={type} type="button" className={value === type ? "active" : ""} aria-pressed={value === type} title={uiText(`platonic.${type}`, {}, locale)} aria-label={uiText(`platonic.${type}`, {}, locale)} onClick={() => onChange(type)}>
      <span aria-hidden="true" style={{ maskImage: `url("/assets/kercad/toolbar-horizontal/platonic/${type}.svg")`, WebkitMaskImage: `url("/assets/kercad/toolbar-horizontal/platonic/${type}.svg")` }} />
    </button>)}
  </div>;
}
