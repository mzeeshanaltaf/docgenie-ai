import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Self-hosted Umami analytics. NEXT_PUBLIC_* → inlined at BUILD time, so these
// must be set before `next build` (in Coolify: build-time args), not just at
// runtime. Renders nothing when unset (e.g. local dev without analytics).
const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

// One sans for UI and display, one mono for figures (see DESIGN.md, Typography).
// Both are variable fonts; the CSS variables are mapped to --font-sans /
// --font-mono in globals.css.
const sans = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

const mono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  display: "swap",
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
    { media: "(prefers-color-scheme: light)", color: "#f8fafd" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1016" },
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
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <JsonLd data={organizationSchema} />
          <MotionProvider>{children}</MotionProvider>
          {/* Mounted at the root, not per-group: the marketing pages (sign-in,
              sign-up, verify-email, forgot-password, contact) report every
              error through toast, and without a Toaster in scope those calls
              render nothing at all. */}
          <Toaster position="bottom-right" richColors />
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
