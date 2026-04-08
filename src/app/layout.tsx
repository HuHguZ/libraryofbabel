import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ClientOverlays from "@/components/ClientOverlays";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Вавилонская Библиотека",
  description:
    "Библиотека, содержащая все возможные книги — каждую комбинацию символов, которую только можно составить.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={`${cormorant.variable} ${jetbrains.variable}`}>
      <body
        style={{
          margin: 0,
          backgroundColor: "#08080f",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        <Providers>
          <ClientOverlays />
          <div className="hex-pattern" />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Header />
            <main style={{ minHeight: "calc(100vh - 130px)" }}>{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
