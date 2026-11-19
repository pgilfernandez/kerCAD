"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import { reportUsage } from "@/lib/usageMetrics";
import "./donationPopup.css";

const options = [
  { name: "GitHub", event: "donateGithub", url: "https://github.com/sponsors/pgilfernandez" },
  { name: "PayPal", event: "donatePaypal", url: "https://www.paypal.com/donate?hosted_button_id=6N7UZHDQW3J6A" },
] as const;

const DonationContext = createContext({ open: false, show: (_locale: KercadLocale, _anchor: HTMLButtonElement) => {} });

export function useDonationPopup() {
  return useContext(DonationContext);
}

export function DonationPopupProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<{ locale: KercadLocale; anchor: HTMLButtonElement } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, pointer: 0, above: false });
  useLayoutEffect(() => {
    if (!popup || !ref.current) return;
    const { anchor } = popup;
    const panel = ref.current;
    const update = () => {
      if (!anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const left = Math.max(8, Math.min(center - panel.offsetWidth / 2, window.innerWidth - panel.offsetWidth - 8));
      const above = rect.bottom + 10 + panel.offsetHeight > window.innerHeight && rect.top >= panel.offsetHeight + 10;
      setPosition({ top: above ? rect.top - 10 - panel.offsetHeight : rect.bottom + 10, left, pointer: center - left, above });
    };
    update();
    panel.querySelector("a")?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !panel.contains(target) && !anchor.contains(target)) setPopup(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPopup(null);
      anchor.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [popup]);
  return <DonationContext.Provider value={{ open: popup !== null, show: (locale, anchor) => {
    void reportUsage("donate");
    setPopup((current) => current?.anchor === anchor ? null : { locale, anchor });
  } }}>
    {children}
    {popup && createPortal(<section ref={ref} role="dialog" aria-label={kercadTranslate(popup.locale, "about.donate")} className={`kercad-donation-dialog${position.above ? " above" : ""}`} style={{ top: position.top, left: position.left, "--donation-pointer": `${position.pointer}px` } as CSSProperties}>
      {options.map(({ name, event, url }) => <a key={name} href={url} target="_blank" rel="noopener noreferrer" onClick={() => { void reportUsage(event); setPopup(null); popup.anchor.focus(); }}>{name}</a>)}
    </section>, document.body)}
  </DonationContext.Provider>;
}
