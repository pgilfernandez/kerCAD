"use client";

import type { ShellCornerType } from "@/types/parametric";

export function ShellCornerButtons({ value = "rounded", locale, onChange }: {
  value?: ShellCornerType;
  locale: "en" | "es";
  onChange: (value: ShellCornerType) => void;
}) {
  return <>{(["sharp", "rounded"] as const).map((mode) => {
    const label = locale === "es" ? mode === "sharp" ? "Aristas vivas" : "Esquinas redondeadas" : mode === "sharp" ? "Sharp corners" : "Rounded corners";
    return <button key={mode} type="button" className={`educad-shell-corner-mode ${value === mode ? "active" : ""}`} title={label} aria-label={label} aria-pressed={value === mode} onClick={() => onChange(mode)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/educad/operations/${mode === "sharp" ? "sharp" : "fillet"}.svg`} width={22} height={22} alt="" draggable={false} />
    </button>;
  })}</>;
}
