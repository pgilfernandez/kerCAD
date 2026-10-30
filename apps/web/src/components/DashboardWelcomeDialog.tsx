"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { KERCAD_LOCALES, kercadTranslate, type KercadLocale } from "@/lib/kercadI18n";
import { AccentColorOptions } from "@/components/AccentColorOptions";
import { useAppTheme } from "@/lib/useAppTheme";
import { useAccessibleDialog } from "@/components/useAccessibleDialog";
import { uiText, getLanguageName } from "@/lib/kercadI18n";

export function DashboardWelcomeDialog({ onLocaleChange, onConfirm }: {
  onLocaleChange: (locale: KercadLocale) => void;
  onConfirm: () => void;
}) {
  const [selectedLocale, setSelectedLocale] = useState<KercadLocale | null>(null);
  const locale = selectedLocale ?? "en";
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
    <form ref={dialogRef} lang={locale} className="kercad-welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="kercad-welcome-title" aria-describedby="kercad-welcome-description" tabIndex={-1} onSubmit={(event) => {
      event.preventDefault();
      if (selectedLocale) onConfirm();
    }}>
      <h2 id="kercad-welcome-title">{uiText("ui.dashboardwelcomedialog.hello.hola.ddf727", {}, locale)}</h2>
      <p id="kercad-welcome-description">{uiText("ui.dashboardwelcomedialog.choose.your.language.to.continue.5ac606", {}, locale)}</p>
      <fieldset>
        <div className="kercad-welcome-languages">{KERCAD_LOCALES.map((language) => <button key={language} type="button" lang={language} aria-pressed={selectedLocale === language} onClick={() => { setSelectedLocale(language); onLocaleChange(language); }}>{getLanguageName(language)}</button>)}</div>
      </fieldset>
      <fieldset><legend>{t("settings.theme")}</legend>
        <div className="kercad-welcome-themes">{(["light", "dark"] as const).map((option) => <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)}>{option === "light" ? <Sun size={19} /> : <Moon size={19} />}{t(option === "light" ? "settings.themeLight" : "settings.themeDark")}</button>)}</div>
        <AccentColorOptions locale={locale} />
      </fieldset>
      <button className="kercad-welcome-confirm" type="submit" disabled={!selectedLocale}>{uiText("dashboard.ok.9ce3bd", {}, locale)}</button>
    </form>
  </div>, document.body);
}
