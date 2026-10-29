"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { KERCAD_LOCALES, kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import { AccentColorOptions } from "@/components/AccentColorOptions";
import { useAppTheme } from "@/lib/useAppTheme";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";

export function DashboardWelcomeDialog({ locale, onLocaleChange, onConfirm }: {
  locale: KercadLocale;
  onLocaleChange: (locale: KercadLocale) => void;
  onConfirm: () => void;
}) {
  const [selectedLocale, setSelectedLocale] = useState<KercadLocale | null>(null);
  const { theme, setTheme } = useAppTheme();
  const dialogRef = useAccessibleDialog<HTMLFormElement>(true, () => {});
  const t = (key: Parameters<typeof kercadTranslate>[1]) => kercadTranslate(locale, key);
  useEffect(() => {
    const dashboard = document.querySelector<HTMLElement>(".kercad-dashboard-shell");
    if (!dashboard) return;
    const previous = dashboard.inert;
    dashboard.inert = true;
    return () => { dashboard.inert = previous; };
  }, []);

  return createPortal(<div className="kercad-welcome-backdrop">
    <form ref={dialogRef} className="kercad-welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-welcome-title" aria-describedby="kercad-welcome-description" tabIndex={-1} onSubmit={(event) => {
      event.preventDefault();
      if (selectedLocale) onConfirm();
    }}>
      <h2 id="kercad-welcome-title">{locale === "es" ? "Te damos la bienvenida a kerCAD" : "Welcome to kerCAD"}</h2>
      <p id="kercad-welcome-description">{locale === "es" ? "Elige tu idioma para continuar. Después podrás cambiar estas preferencias en cualquier momento." : "Choose your language to continue. You can change these preferences at any time later."}</p>
      <fieldset><legend>{t("settings.language")}</legend>
        <div className="kercad-welcome-languages">{KERCAD_LOCALES.map((language) => <button key={language} type="button" lang={language} aria-pressed={selectedLocale === language} onClick={() => { setSelectedLocale(language); onLocaleChange(language); }}>{kercadTranslate(language, language === "en" ? "settings.english" : "settings.spanish")}</button>)}</div>
      </fieldset>
      <fieldset><legend>{t("settings.theme")}</legend>
        <div className="kercad-welcome-themes">{(["light", "dark"] as const).map((option) => <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)}>{option === "light" ? <Sun size={19} /> : <Moon size={19} />}{t(option === "light" ? "settings.themeLight" : "settings.themeDark")}</button>)}</div>
        <AccentColorOptions locale={locale} />
      </fieldset>
      <button className="kercad-welcome-confirm" type="submit" disabled={!selectedLocale}>OK</button>
    </form>
  </div>, document.body);
}
