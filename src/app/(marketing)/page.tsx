import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { JsonLd } from "@/components/seo/json-ld";
import {
  ClosingSection,
  FaqSection,
  Hero,
  LimitsSection,
  PipelineSection,
  PreviewSection,
  StackSection,
} from "@/components/marketing/landing/sections";
import {
  faqSchema,
  softwareApplicationSchema,
} from "@/components/marketing/landing/content";

export const metadata: Metadata = {
  title: { absolute: "DocGenie: ask your documents, check the source" },
  description:
    "Chat with PDF, DOCX, TXT and CSV files. Every answer cites the page it came from, opens the original on click, and shows the search and timings behind it.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <MarketingPage>
      <JsonLd data={softwareApplicationSchema} />
      <JsonLd data={faqSchema} />
      {/* Scroll reveals start hidden because they are driven by whileInView.
          Without JavaScript nothing would ever reveal them, so show them. */}
      <noscript>
        <style>{`[style*="opacity: 0"],[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <Hero />
      <PipelineSection />
      <LimitsSection />
      <StackSection />
      <PreviewSection />
      <FaqSection />
      <ClosingSection />
    </MarketingPage>
  );
}
