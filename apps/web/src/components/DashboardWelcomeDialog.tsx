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
      <img className="kercad-welcome-logo" src="/assets/kercad/kercad_logo_color.svg" width={64} height={64} alt={uiText("ui.page.kercad.c0bf6d", {}, locale)} />
      <h2 id="kercad-welcome-title">{uiText("ui.dashboardwelcomedialog.hello.hola.ddf727", {}, locale)}</h2>
      <div id="kercad-welcome-description" className="kercad-welcome-section-label">{t("settings.language")}</div>
      <div className="kercad-welcome-language-group" role="group" aria-label={t("settings.language")}>
        <div className="kercad-welcome-languages">{KERCAD_LOCALES.map((language) => <button key={language} type="button" lang={language} aria-pressed={selectedLocale === language} onClick={() => { setSelectedLocale(language); onLocaleChange(language); }}>{getLanguageName(language)}</button>)}</div>
      </div>
      <fieldset><legend>{t("settings.theme")}</legend>
        <div className="kercad-welcome-themes">{(["light", "dark"] as const).map((option) => <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)}>{option === "light" ? <Sun size={19} /> : <Moon size={19} />}{t(option === "light" ? "settings.themeLight" : "settings.themeDark")}</button>)}</div>
        <AccentColorOptions locale={locale} />
      </fieldset>
      <button className="kercad-welcome-confirm" type="submit" disabled={!selectedLocale}>{uiText("dashboard.ok.9ce3bd", {}, locale)}</button>
    </form>
  </div>, document.body);
}
