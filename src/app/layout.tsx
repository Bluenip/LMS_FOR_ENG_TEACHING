import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getAppName } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { THEME_INIT_SCRIPT } from "@/lib/theme/config";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const appName = getAppName();
  const { m } = await getI18n();
  return {
    title: `${appName} — ${m.app.tagline}`,
    description: m.app.tagline,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
