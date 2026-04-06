import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "HireMind AI - AI-Driven Hiring",
  description: "End-to-end AI-driven hiring pipeline — from aptitude tests to technical interviews."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}

