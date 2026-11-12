import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How DocGenie collects, uses and protects your data, and which services touch it.",
  alternates: { canonical: "/privacy" },
};

const sections: LegalSection[] = [
  {
    title: "1. Information we collect",
    body: [
      "When you create an account, we collect your name and email address. Passwords are stored only as salted, one-way hashes; we never store your password in plain text. You may also sign in with Google, in which case we receive your name, email address, and profile image from Google.",
      "When you use our document Q&A features, we store the files you upload, extract their text, split it into passages and index those passages (including numerical representations of their meaning, called embeddings) so we can find the relevant parts when you ask a question. We also store your conversations (your questions, the answers, and any like or dislike feedback you give) and a record of your credit usage.",
      "We use a self-hosted, privacy-friendly analytics tool (Umami) to collect aggregate usage data such as pages visited, referrers, and approximate location, device, and browser type. This data is anonymous, collected without cookies, and is not linked to your identity or personal account.",
    ],
  },
  {
    title: "2. How we use your information",
    body: [
      "To provide and improve the DocGenie service, including processing documents and generating AI-powered answers to your questions.",
      "To manage your account, process credits, and send transactional emails (for example email verification codes and password resets).",
      "To analyse usage patterns in aggregate to inform product decisions. We do not sell your personal data to third parties.",
    ],
  },
  {
    title: "3. Data retention",
    body: [
      "Account data (name, email) is retained for as long as your account is active. You can delete your account yourself in Settings, under Account, or ask us to delete it through the contact form.",
      "Uploaded documents (the original files, the extracted text and the index built from it) are retained while your account is active, or until you delete the document.",
      "Chat history, feedback and credit records stored in your dashboard are retained while your account is active. When you delete your account from Settings, your documents, stored files, conversations, feedback, credit records and sign-in details are removed straight away. If you ask us to delete the account instead, we complete this within 30 days of your request.",
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
      "You have the right to access, correct, or delete your personal data at any time. Settings, under Account, lets you download an export of your documents, conversations and credit records, and delete your account. For anything else, use the contact form.",
      "If you are located in the European Economic Area, you have rights under GDPR including the right to data portability and the right to object to processing.",
      "We will respond to all privacy-related requests within 30 days.",
    ],
  },
  {
    title: "7. Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. We will notify you of material changes by email or by displaying a notice in the application. Continued use of the service after changes constitutes acceptance of the updated policy.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      updated="12 November 2026"
      intro={'DocGenie ("we", "our", or "us") is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights in relation to it.'}
      sections={sections}
      closing={{
        title: "Questions about privacy",
        body: "If you have questions about this policy or want to exercise your rights, get in touch.",
      }}
    />
  );
}
