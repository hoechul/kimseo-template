import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Toaster } from "sonner";

import { AppActivityTracker } from "@/components/app-activity-tracker";

import "./globals.css";

export const metadata: Metadata = {
  title: "김비서",
  description: "김비서 - 내부 운영 대시보드",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0d6e6e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="antialiased">
        <Suspense fallback={null}>
          <AppActivityTracker />
        </Suspense>
        {children}
        <Toaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}
