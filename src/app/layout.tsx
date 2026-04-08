import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { Providers } from "./providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const playfair = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  variable: "--font-playfair",
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
    <html lang="ru" className={playfair.variable}>
      <body
        style={{
          margin: 0,
          backgroundColor: "var(--chakra-colors-dark-800)",
          minHeight: "100vh",
        }}
      >
        <Providers>
          <Header />
          <main style={{ minHeight: "calc(100vh - 130px)" }}>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
