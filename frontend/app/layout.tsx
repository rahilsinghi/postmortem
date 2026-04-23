import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { ApiHealth } from "../components/ApiHealth";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { DemoProvider } from "../lib/demo/DemoProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Postmortem — decision archaeology",
  description:
    "Postmortem reads a repo's PR history, reconstructs the architectural decisions and rejected alternatives, and answers questions with citations back to the exact comment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Suspense boundary required — DemoProvider calls useSearchParams(). */}
        <Suspense fallback={null}>
          <DemoProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </DemoProvider>
        </Suspense>
        <ApiHealth />
      </body>
    </html>
  );
}
