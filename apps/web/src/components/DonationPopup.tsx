"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import "./donationPopup.css";

const options = [
  { name: "GitHub", url: "https://github.com/sponsors/pgilfernandez" },
  { name: "PayPal", url: "https://www.paypal.com/donate?hosted_button_id=6N7UZHDQW3J6A" },
] as const;

const DonationContext = createContext({ open: false, show: (_locale: KercadLocale) => {} });

export function useDonationPopup() {
  return useContext(DonationContext);
}

export function DonationPopupProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<KercadLocale | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = locale !== null;
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <DonationContext.Provider value={{ open, show: setLocale }}>
    {children}
    <dialog ref={ref} className="kercad-donation-dialog" aria-labelledby={titleId} onClose={() => setLocale(null)} onClick={(event) => { if (event.target === event.currentTarget) setLocale(null); }}>
      {locale && <section>
        <header><h2 id={titleId}>{kercadTranslate(locale, "about.donate")}</h2><button type="button" aria-label={kercadTranslate(locale, "common.close")} onClick={() => setLocale(null)}>×</button></header>
        <div className="kercad-donation-options">{options.map(({ name, url }) => <a key={name} href={url} target="_blank" rel="noopener noreferrer" onClick={() => setLocale(null)}>{name}</a>)}</div>
      </section>}
    </dialog>
  </DonationContext.Provider>;
}
