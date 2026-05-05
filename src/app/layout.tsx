import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { Analytics } from "@vercel/analytics/next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020817" },
  ],
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "DocGenie",
  url: "https://docgenie.zeeshanai.cloud",
  logo: "https://docgenie.zeeshanai.cloud/icon.png",
  description:
    "AI-powered document Q&A platform. Upload PDFs, Word docs, spreadsheets, and text files and get instant AI-powered answers.",
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
            <JsonLd data={organizationSchema} />
            {children}
            <Analytics />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
