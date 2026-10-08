import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

// Body text in DM Sans; headings in Schibsted Grotesk, upright and firm.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const grotesk = Schibsted_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Your job hunt on autopilot: track applications directly from your inbox, securely approved via Telegram.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Smooth scrolling for the landing page's anchors; Next turns it off during navigation.
    <html lang="en" data-scroll-behavior="smooth" className={`${dmSans.variable} ${grotesk.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
