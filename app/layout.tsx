import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Walk With Me — Your AI Spiritual Guide",
  description:
    "A compassionate AI guide inspired by the teachings and wisdom of Jesus Christ. Find comfort, guidance, and spiritual counsel in a safe and peaceful space.",
  keywords: [
    "spiritual guide",
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
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
