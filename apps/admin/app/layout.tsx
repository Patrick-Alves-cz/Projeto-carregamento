import type { Metadata } from "next";
import { APP_NAME } from "@evcharge/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} — Admin`,
  description: "Painel administrativo da plataforma de recarga de veículos elétricos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
