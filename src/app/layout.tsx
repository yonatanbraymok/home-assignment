import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

// One friendly geometric sans for everything, headings included.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
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
    <html lang="en" data-scroll-behavior="smooth" className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
