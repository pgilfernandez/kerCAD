import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eduCAD — CAD paramétrico para aprender",
  description: "Editor CAD paramétrico, local y open source orientado a educación.",
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
