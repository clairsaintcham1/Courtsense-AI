import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CourtSense AI — AI-Powered Basketball Coaching",
  description:
    "Get elite-level basketball coaching anywhere. Upload training footage and receive instant AI-powered analysis, personalized workout plans, and 24/7 coaching — all from your phone.",
  keywords: [
    "basketball coaching",
    "AI basketball coach",
    "video analysis",
    "training plans",
    "sports AI",
    "youth basketball",
  ],
  openGraph: {
    title: "CourtSense AI — AI-Powered Basketball Coaching",
    description:
      "Upload your game footage and get instant AI analysis, personalized training plans, and 24/7 coaching.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-black text-zinc-100 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
