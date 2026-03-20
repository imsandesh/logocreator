import type { Metadata } from "next";
import { Jura } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/app/components/ui/toaster";
import PlausibleProvider from "next-plausible";

const jura = Jura({
  subsets: ["latin"],
  variable: "--font-jura",
});

export const metadata: Metadata = {
  title: "Logo-creator.io – Generate a logo",
  description: "Generate a logo for your company",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${jura.variable} dark min-h-full bg-[#343434] font-jura antialiased`}
      >
        <ClerkProvider>
          <PlausibleProvider domain="logo-creator.io">
            {children}
            <Toaster />
          </PlausibleProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}