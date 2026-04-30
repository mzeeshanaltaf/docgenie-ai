import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { JsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "DocGenie Terms of Service — the rules governing your use of our platform.",
  alternates: { canonical: "/terms" },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://docgenie.zeeshanai.cloud" },
    { "@type": "ListItem", position: 2, name: "Terms of Service", item: "https://docgenie.zeeshanai.cloud/terms" },
  ],
};

const sections = [
  {
    title: "1. Acceptance of terms",
    body: [
      "By accessing or using DocGenie (the \"Service\"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.",
      "We reserve the right to modify these terms at any time. Continued use of the Service after changes are posted constitutes your acceptance of the revised terms.",
    ],
  },
  {
    title: "2. Description of service",
    body: [
      "DocGenie provides AI-powered document Q&A. The Service allows you to upload documents and ask questions, receiving AI-generated answers sourced from your document content.",
      "The Service is provided on an \"as is\" and \"as available\" basis. We do not guarantee the accuracy of AI-generated answers.",
    ],
  },
  {
    title: "3. Accounts and credits",
    body: [
      "You must create an account to access the full Service. You are responsible for maintaining the confidentiality of your account credentials.",
      "The Service operates on a credit system. Free accounts receive 5 document credits and 25 message credits. Document credits are consumed when you upload a document, and message credits are consumed when you send a chat message. Credits are non-transferable.",
      "We reserve the right to modify the credit system, pricing, and feature availability at any time with reasonable notice.",
    ],
  },
  {
    title: "4. Acceptable use",
    body: [
      "You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not use the Service to submit false, misleading, or fraudulent content.",
      "You must not attempt to reverse-engineer, scrape, or interfere with the Service or its underlying infrastructure.",
      "You must not use the Service in any way that violates the rights of others, including intellectual property rights.",
    ],
  },
  {
    title: "5. Your content",
    body: [
      "You retain ownership of any documents or other content you submit to the Service. By submitting content, you grant us a limited, non-exclusive licence to process that content solely for the purpose of delivering the Service.",
      "You represent that you have the right to submit any content you provide, and that doing so does not violate any third-party rights.",
    ],
  },
  {
    title: "6. Intellectual property",
    body: [
      "The Service, including its software, design, and AI models, is owned by DocGenie and protected by applicable intellectual property laws.",
      "You may not copy, modify, distribute, or create derivative works from any part of the Service without our prior written consent.",
    ],
  },
  {
    title: "7. Disclaimer of warranties",
    body: [
      "The Service is provided without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.",
      "We do not warrant that AI-generated answers will be accurate or complete. You should verify important information from original sources.",
    ],
  },
  {
    title: "8. Limitation of liability",
    body: [
      "To the fullest extent permitted by law, DocGenie shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of, or inability to use, the Service.",
      "Our total liability to you for any claim arising from these Terms or your use of the Service shall not exceed the amount you paid to us in the 12 months preceding the claim.",
    ],
  },
  {
    title: "9. Termination",
    body: [
      "We may suspend or terminate your account at any time if you violate these Terms or if we discontinue the Service.",
      "You may close your account at any time by contacting us. Upon termination, your right to use the Service ceases immediately.",
    ],
  },
  {
    title: "10. Governing law",
    body: [
      "These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the competent courts.",
      "These Terms were last updated on 9 March 2026.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={breadcrumbSchema} />
      <Navbar />

      <main className="flex-1">
        <section className="border-b border-border/50 px-4 py-16 md:py-20">
          <div className="container mx-auto max-w-3xl">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Legal
            </p>
            <h1
              className="mt-4 text-4xl tracking-tight md:text-5xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
            >
              Terms of Service
            </h1>
            <p className="mt-4 text-muted-foreground">
              Last updated: 9 March 2026
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Please read these Terms of Service carefully before using DocGenie. By using the
              Service, you agree to be bound by these terms.
            </p>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="container mx-auto max-w-3xl space-y-12">
            {sections.map(({ title, body }) => (
              <div key={title}>
                <h2 className="text-xl font-semibold">{title}</h2>
                <div className="mt-4 space-y-3">
                  {body.map((paragraph, i) => (
                    <p key={i} className="leading-relaxed text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border bg-muted/30 p-6">
              <p className="font-semibold">Questions about these terms?</p>
              <p className="mt-2 text-sm text-muted-foreground">
                If you have any questions about these Terms of Service, use the Contact link in
                the footer and we&apos;ll be happy to help.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
