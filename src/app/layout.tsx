import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { Toaster } from "@/components/ui/sonner";
import { BRAND_HEX } from "@/lib/brand";
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

const SITE_TITLE = "DocGenie: ask your documents, check the source";
const SITE_DESCRIPTION =
  "Chat with PDF, DOCX, TXT and CSV files. Every answer cites the page it came from, opens the original on click, and shows the search and timings behind it.";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s | DocGenie",
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL("https://docgenie.zeeshanai.cloud"),
  openGraph: {
    type: "website",
    url: "https://docgenie.zeeshanai.cloud",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: "DocGenie",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The paper colors from globals.css (see lib/brand.ts for the oklch source).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_HEX.paper },
    { media: "(prefers-color-scheme: dark)", color: BRAND_HEX.paperDark },
  ],
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "DocGenie",
  url: "https://docgenie.zeeshanai.cloud",
  logo: "https://docgenie.zeeshanai.cloud/logo.svg",
  description:
    "DocGenie is a document question-answering service: answers are grounded in the uploaded file and cite the page they came from.",
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
