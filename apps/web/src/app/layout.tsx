import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="es" style={{ colorScheme: "light" }}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
