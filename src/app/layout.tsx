import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { JsonLd } from "@/components/seo/json-ld";
import "./globals.css";

// Self-hosted Umami analytics. NEXT_PUBLIC_* → inlined at BUILD time, so these
// must be set before `next build` (in Coolify: build-time args), not just at
// runtime. Renders nothing when unset (e.g. local dev without analytics).
const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

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
        </ThemeProvider>
        {umamiScriptUrl && umamiWebsiteId && (
          <Script
            src={umamiScriptUrl}
            data-website-id={umamiWebsiteId}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
