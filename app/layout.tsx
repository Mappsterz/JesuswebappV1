import type { Metadata } from "next";
import "./globals.css";

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
