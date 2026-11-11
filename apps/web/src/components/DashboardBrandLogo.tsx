"use client";

import { useEffect, useRef, useState } from "react";

/** Keep the white logo until the restarted animation is ready to paint. */
export function DashboardBrandLogo() {
  const [cycle, setCycle] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [readyCycle, setReadyCycle] = useState<number | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const brand = root.current?.closest(".kercad-dashboard-brand");
    const restart = () => { setHovered(true); setReadyCycle(null); setCycle((value) => value + 1); };
    const leave = () => setHovered(false);
    brand?.addEventListener("mouseenter", restart);
    brand?.addEventListener("mouseleave", leave);
    return () => { brand?.removeEventListener("mouseenter", restart); brand?.removeEventListener("mouseleave", leave); };
  }, []);
  return <span ref={root} className="kercad-dashboard-logo kercad-dashboard-logo-swap" data-active={hovered && readyCycle === cycle} data-loading={hovered && readyCycle !== cycle} aria-hidden="true">
    <img className="kercad-brand-logo-white" src="/assets/kercad/kercad_logo_white.svg" alt="" draggable={false} />
    {cycle > 0 && <img key={cycle} className="kercad-brand-logo-animation" src={`/assets/kercad/kercad_logo_animation_1.svg?play=${cycle}`} alt="" draggable={false} onLoad={(event) => {
      const image = event.currentTarget;
      void image.decode().then(() => requestAnimationFrame(() => { if (image.isConnected) setReadyCycle(cycle); })).catch(() => { /* Keep the white logo if decoding fails. */ });
    }} />}
  </span>;
}
