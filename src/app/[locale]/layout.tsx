import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Providers } from "../providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ClientOverlays from "@/components/ClientOverlays";
import "../globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["cyrillic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["cyrillic", "latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${cormorant.variable} ${jetbrains.variable}`}>
      <body
        style={{
          margin: 0,
          backgroundColor: "#08080f",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        <NextIntlClientProvider>
          <Providers>
            <ClientOverlays />
            <div className="hex-pattern" />
            <div style={{ position: "relative", zIndex: 1 }}>
              <Header />
              <main style={{ minHeight: "calc(100vh - 130px)" }}>{children}</main>
              <Footer />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
