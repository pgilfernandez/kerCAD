import type { Metadata } from "next";
import "./globals.css";
import "./themes/dark-overrides.css";
import { APP_THEME_INITIAL_SCRIPT } from "@/lib/appTheme";

export const metadata: Metadata = {
  title: "eduCAD — Parametric CAD for learning",
  description: "Local, open-source parametric CAD editor designed for education.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: APP_THEME_INITIAL_SCRIPT }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
