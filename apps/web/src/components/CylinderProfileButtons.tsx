"use client";

import { uiText, type KercadLocale } from "@/lib/kercadI18n";

export function CylinderProfileButtons({ elliptical, locale, onChange }: { elliptical: boolean; locale: KercadLocale; onChange: (elliptical: boolean) => void }) {
  return <div className="kercad-cylinder-profile-buttons" role="group" aria-label={uiText("property.profile", {}, locale)}>
    {[false, true].map((ellipse) => <button key={String(ellipse)} type="button" className={elliptical === ellipse ? "active" : ""} aria-pressed={elliptical === ellipse} onClick={() => onChange(ellipse)}>
      <span aria-hidden="true" className="kercad-cylinder-profile-icon" style={{ maskImage: `url("/assets/kercad/toolbar-horizontal/cylinder-${ellipse ? "ellipse" : "circle"}.svg")`, WebkitMaskImage: `url("/assets/kercad/toolbar-horizontal/cylinder-${ellipse ? "ellipse" : "circle"}.svg")` }} />
      {uiText(ellipse ? "cylinder.ellipse" : "cylinder.circle", {}, locale)}
    </button>)}
  </div>;
}
