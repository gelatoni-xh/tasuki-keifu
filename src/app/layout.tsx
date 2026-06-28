import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "襷の系譜",
  description: "高校・大学・実業団をつなぐ駅伝データベース",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
