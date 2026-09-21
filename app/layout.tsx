import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AuthHashCatcher from "@/components/AuthHashCatcher";

// Familles de lib/tokens.ts (T.font.family) : titres, interface, métadonnées.
const display = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const text = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const meta = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brand OS",
  description: "Self-serve Brand OS — SaaS Lab",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${display.variable} ${text.variable} ${meta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-scene text-ink">
        <AuthHashCatcher />
        {children}
      </body>
    </html>
  );
}
