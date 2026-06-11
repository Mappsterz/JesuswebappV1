import type { Metadata } from "next";
import { Cinzel, Lora } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-body",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Walk With Me — Your AI Spiritual Companion",
  description:
    "A compassionate AI companion inspired by the teachings and wisdom of Jesus Christ. Find comfort, guidance, and spiritual counsel in a safe and peaceful space.",
  keywords: [
    "spiritual companion",
    "AI counselor",
    "faith",
    "prayer",
    "devotional",
    "Jesus",
    "Christian",
    "guidance",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${cinzel.variable} ${lora.variable}`}>{children}</body>
    </html>
  );
}
