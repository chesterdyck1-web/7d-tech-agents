import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "7D Tech — The right first response, every time.",
  description:
    "When a prospect fills out your contact form, a personalized reply is drafted in 30 seconds. You approve it with one tap. It sends.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
