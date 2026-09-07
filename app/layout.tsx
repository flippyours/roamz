import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROAMZ — The Lost Route",
  description: "1,111 wanderers. No fixed destination. Find the lost signals and apply for the Roamz allowlist.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#050705" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
