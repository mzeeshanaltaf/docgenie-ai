import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { JsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "DocGenie Privacy Policy — how we collect, use, and protect your data.",
  alternates: { canonical: "/privacy" },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://docgenie.zeeshanai.cloud" },
    { "@type": "ListItem", position: 2, name: "Privacy Policy", item: "https://docgenie.zeeshanai.cloud/privacy" },
  ],
};

const sections = [
  {
    title: "1. Information we collect",
    body: [
      "When you create an account, we collect your name and email address. Passwords are stored only as salted, one-way hashes — we never store your password in plain text. You may also sign in with Google, in which case we receive your name, email address, and profile image from Google.",
      "When you use our document Q&A features, we store the files you upload, extract their text, split it into passages and index those passages (including numerical representations of their meaning, called embeddings) so we can find the relevant parts when you ask a question. We also store your conversations (your questions, the answers, and any like or dislike feedback you give) and a record of your credit usage.",
      "We use a self-hosted, privacy-friendly analytics tool (Umami) to collect aggregate usage data such as pages visited, referrers, and approximate location, device, and browser type. This data is anonymous, collected without cookies, and is not linked to your identity or personal account.",
    ],
  },
  {
    title: "2. How we use your information",
    body: [
      "To provide and improve the DocGenie service, including processing documents and generating AI-powered answers to your questions.",
      "To manage your account, process credits, and send transactional emails (e.g. email verification codes and password resets).",
      "To analyse usage patterns in aggregate to inform product decisions. We do not sell your personal data to third parties.",
    ],
  },
  {
    title: "3. Data retention",
    body: [
      "Account data (name, email) is retained for as long as your account is active. You may request deletion at any time by contacting us.",
      "Uploaded documents (the original files, the extracted text and the index built from it) are retained while your account is active, or until you delete the document.",
      "Chat history, feedback and credit records stored in your dashboard are retained while your account is active. When your account is deleted, we remove your documents, stored files, conversations, feedback and credit records, and we complete this within 30 days of your request.",
    ],
  },
  {
    title: "4. Third-party services",
    body: [
      "We use Google Sign-In as an optional authentication method. If you choose it, Google's privacy policy applies to the data processed during sign-in. Authentication is otherwise handled by our own systems on infrastructure we control.",
      "AI processing is provided by OpenAI. To answer your questions we send OpenAI your question, the recent messages of the conversation, and the passages of your documents that are relevant to the question. We also send it document text to create embeddings, the text of the first question to create a chat title, and, for scanned PDFs without a text layer, images of the pages so their text can be recognised. We send these requests with storage disabled, so we do not ask OpenAI to keep them, and OpenAI's own API data policy governs how it handles them on its side. Your files themselves are stored on infrastructure we control.",
      "Verification codes and password-reset emails are delivered through Resend, which receives your email address and the message content. If you use the contact form, your name, email address and message are passed to a workflow tool (n8n) that we host ourselves, and the form's spam protection uses a rate-limiting service (Upstash) that briefly processes your IP address.",
      "Our website analytics are powered by Umami, a privacy-first analytics tool we self-host on our own infrastructure. It is cookieless, does not track you across other websites, and does not collect personally identifiable information. We do not use third-party advertising networks or tracking pixels.",
    ],
  },
  {
    title: "5. Cookies",
    body: [
      "We use strictly necessary session cookies to keep you logged in. We do not use tracking cookies or third-party marketing cookies, and our analytics (Umami) operates entirely without cookies.",
      "You can disable cookies in your browser settings, but this may prevent you from logging in to the application.",
    ],
  },
  {
    title: "6. Your rights",
    body: [
      "You have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us using the link in the footer.",
      "If you are located in the European Economic Area, you have rights under GDPR including the right to data portability and the right to object to processing.",
      "We will respond to all privacy-related requests within 30 days.",
    ],
  },
  {
    title: "7. Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. We will notify you of material changes by email or by displaying a notice in the application. Continued use of the service after changes constitutes acceptance of the updated policy.",
      "This policy was last updated on 12 November 2026.",
    ],
  },
];

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="mt-4 text-muted-foreground">
              Last updated: 12 November 2026
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              DocGenie (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to
              protecting your privacy. This policy explains what data we collect, how we use it,
              and your rights in relation to it.
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
              <p className="font-semibold">Contact us about privacy</p>
              <p className="mt-2 text-sm text-muted-foreground">
                If you have questions about this Privacy Policy or want to exercise your rights,
                use the Contact link in the footer or email us directly.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
