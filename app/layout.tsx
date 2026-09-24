import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
