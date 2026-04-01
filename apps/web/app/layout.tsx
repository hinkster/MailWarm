import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MailWarm — Domain Warming & Deliverability Intelligence",
    template: "%s | MailWarm",
  },
  description:
    "Automatically warm your email domains, authenticate with SPF/DKIM/DMARC, and land in the inbox — not the spam folder.",
  keywords: ["email warming", "domain warming", "deliverability", "SPF", "DKIM", "DMARC", "inbox placement"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://mailwarm.io",
    siteName: "MailWarm",
    title: "MailWarm — Domain Warming & Deliverability Intelligence",
    description: "Land in the inbox. Every time.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MailWarm" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MailWarm — Domain Warming & Deliverability Intelligence",
    description: "Land in the inbox. Every time.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased bg-slate-950 text-white`}>
        {children}
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  );
}
