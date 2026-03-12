import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DocGenie — Chat With Your Documents",
    template: "%s | DocGenie",
  },
  description:
    "Upload PDFs, Word docs, text files, or spreadsheets and chat with them using AI. Get instant answers from your documents.",
  metadataBase: new URL("https://docgenie.zeeshanai.cloud"),
  openGraph: {
    type: "website",
    url: "https://docgenie.zeeshanai.cloud",
    title: "DocGenie — Chat With Your Documents",
    description:
      "Upload documents and ask questions. DocGenie reads, understands, and answers instantly using AI.",
    siteName: "DocGenie",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocGenie — Chat With Your Documents",
    description:
      "Upload documents and ask questions. DocGenie reads, understands, and answers instantly using AI.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${geist.variable} font-sans antialiased`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
