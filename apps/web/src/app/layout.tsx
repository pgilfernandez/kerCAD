import type { Metadata } from "next";
import "./globals.css";
import "./themes/dark-overrides.css";
import "./themes/accent.css";
import { APP_ACCENT_INITIAL_SCRIPT } from "@/lib/appAccent";
import { APP_THEME_INITIAL_SCRIPT } from "@/lib/appTheme";
import { BRAND_STORAGE_INITIAL_SCRIPT } from "@/lib/legacyBrand";
import { AppAccentSync } from "@/components/AppAccentSync";
import { LoadingCampaignPreloader } from "@/components/LoadingCampaignPreloader";
import { projectLoadingCampaign } from "@/lib/projectLoadingCampaign";
import { APP_LOCALE_INITIAL_SCRIPT, uiText } from "@/lib/kercadI18n";

export const metadata: Metadata = {
  icons: { icon: { url: "/assets/kercad/kercad_favicon.svg", type: "image/svg+xml" } },
  title: uiText("ui.layout.kercad.parametric.cad.for.learning.9bfd81"),
  description: uiText("ui.layout.local.open.source.parametric.cad.editor.designed.e15816"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BRAND_STORAGE_INITIAL_SCRIPT + APP_THEME_INITIAL_SCRIPT + APP_ACCENT_INITIAL_SCRIPT + APP_LOCALE_INITIAL_SCRIPT }} />
        {projectLoadingCampaign.kind === "image" && <link rel="preload" as="image" href={projectLoadingCampaign.src} fetchPriority="high" />}
      </head>
      <body suppressHydrationWarning><AppAccentSync /><LoadingCampaignPreloader />{children}</body>
    </html>
  );
}
