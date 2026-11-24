import type { Metadata } from "next";
import "./globals.css";
import "./themes/dark-overrides.css";
import "./themes/accent.css";
import { APP_ACCENT_INITIAL_SCRIPT } from "@/lib/appAccent";
import { APP_THEME_INITIAL_SCRIPT } from "@/lib/appTheme";
import { BRAND_STORAGE_INITIAL_SCRIPT } from "@/lib/legacyBrand";
import { AppAccentSync } from "@/components/AppAccentSync";
import { UsageMetrics } from "@/components/UsageMetrics";
import { DonationPopupProvider } from "@/components/DonationPopup";
import { LoadingCampaignPreloader } from "@/components/LoadingCampaignPreloader";
import { APP_LOCALE_INITIAL_SCRIPT, uiText } from "@/lib/kercadI18n";

const title = uiText("ui.layout.kercad.parametric.cad.for.learning.9bfd81");
const description = uiText("ui.layout.local.open.source.parametric.cad.editor.designed.e15816");
const previewImage = "/assets/kercad/kercad_web_thumbnail.jpg";

export const metadata: Metadata = {
  metadataBase: new URL("https://kercad.org"),
  icons: { icon: { url: "/assets/kercad/kercad_favicon.svg", type: "image/svg+xml" } },
  title,
  description,
  openGraph: {
    type: "website",
    title,
    description,
    images: [{ url: previewImage, width: 1200, height: 630, type: "image/jpeg" }],
  },
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
      </head>
      <body suppressHydrationWarning><AppAccentSync /><LoadingCampaignPreloader /><UsageMetrics /><DonationPopupProvider>{children}</DonationPopupProvider></body>
    </html>
  );
}
