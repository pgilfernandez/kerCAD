"use client";

import { uiText, type KercadLocale } from "@/lib/kercadI18n";

export function CylinderProfileButtons({ elliptical, locale, onChange, sphere = false, hemisphere = false }: { elliptical: boolean; locale: KercadLocale; onChange: (elliptical: boolean) => void; sphere?: boolean; hemisphere?: boolean }) {
  const label = (ellipse: boolean) => uiText(hemisphere ? ellipse ? "halfSphere.ellipsoid" : "halfSphere.sphere" : sphere ? ellipse ? "sphere.ellipsoid" : "sphere.sphere" : ellipse ? "cylinder.ellipse" : "cylinder.circle", {}, locale);
  return <div className="kercad-cylinder-profile-buttons" role="group" aria-label={uiText("property.profile", {}, locale)}>
    {[false, true].map((ellipse) => <button key={String(ellipse)} type="button" className={elliptical === ellipse ? "active" : ""} aria-label={label(ellipse)} title={label(ellipse)} aria-pressed={elliptical === ellipse} onClick={() => onChange(ellipse)}>
      <span aria-hidden="true" className="kercad-cylinder-profile-icon" style={{ maskImage: `url("/assets/kercad/toolbar-horizontal/cylinder-${ellipse ? "ellipse" : "circle"}.svg")`, WebkitMaskImage: `url("/assets/kercad/toolbar-horizontal/cylinder-${ellipse ? "ellipse" : "circle"}.svg")` }} />
    </button>)}
  </div>;
}
