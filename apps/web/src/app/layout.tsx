import type { Metadata } from "next";
import "./globals.css";
import "./themes/dark-overrides.css";
import { APP_THEME_INITIAL_SCRIPT } from "@/lib/appTheme";
import { BRAND_STORAGE_INITIAL_SCRIPT } from "@/lib/legacyBrand";

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
      <head><script dangerouslySetInnerHTML={{ __html: BRAND_STORAGE_INITIAL_SCRIPT + APP_THEME_INITIAL_SCRIPT }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
