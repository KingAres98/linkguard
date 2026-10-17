import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from our own
// domain, which our security policy (font-src 'self') requires.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Headings and labels only: angular, techy, and not used for long text.
const chakraPetch = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LinkGuard",
  description:
    "Defensive URL and domain security posture scanner. Reports observable security properties, not verdicts.",
};

export const viewport: Viewport = {
  themeColor: "#07080f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}