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

export const metadata: Metadata = {
  title: "kerCAD — Parametric CAD for learning",
  description: "Local, open-source parametric CAD editor designed for education.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BRAND_STORAGE_INITIAL_SCRIPT + APP_THEME_INITIAL_SCRIPT + APP_ACCENT_INITIAL_SCRIPT }} />
        {projectLoadingCampaign.kind === "image" && <link rel="preload" as="image" href={projectLoadingCampaign.src} fetchPriority="high" />}
      </head>
      <body suppressHydrationWarning><AppAccentSync /><LoadingCampaignPreloader />{children}</body>
    </html>
  );
}
