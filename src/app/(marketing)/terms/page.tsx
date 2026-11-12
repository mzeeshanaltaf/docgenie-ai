import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { SIGNUP_DOCUMENT_CREDITS, SIGNUP_MESSAGE_CREDITS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules that apply when you use DocGenie.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    title: "1. Acceptance of terms",
    body: [
      'By accessing or using DocGenie (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.',
      "We reserve the right to modify these terms at any time. Continued use of the Service after changes are posted constitutes your acceptance of the revised terms.",
    ],
  },
  {
    title: "2. Description of service",
    body: [
      "DocGenie provides AI-powered document Q&A. The Service allows you to upload documents and ask questions, receiving AI-generated answers sourced from your document content.",
      'The Service is provided on an "as is" and "as available" basis. We do not guarantee the accuracy of AI-generated answers.',
    ],
  },
  {
    title: "3. Accounts and credits",
    body: [
      "You must create an account to access the full Service. You are responsible for maintaining the confidentiality of your account credentials.",
      `The Service operates on a credit system. A new account receives ${SIGNUP_DOCUMENT_CREDITS} document credits and ${SIGNUP_MESSAGE_CREDITS} message credits. A document credit is used when you upload a document, and a message credit is used when you send a chat message. A credit is returned when an upload fails or when a chat message produces no answer. Credits are non-transferable, and there is currently no way to buy more.`,
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
      "The Service, including its software and design, is owned by DocGenie and protected by applicable intellectual property laws.",
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
      "You may close your account at any time from Settings, under Account, or by contacting us. Closing it removes your documents and conversations. Once it is closed, your right to use the Service ends.",
    ],
  },
  {
    title: "10. Governing law",
    body: [
      "These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the competent courts.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      path="/terms"
      updated="12 November 2026"
      intro="Please read these Terms of Service carefully before using DocGenie. By using the Service, you agree to be bound by them."
      sections={sections}
      closing={{
        title: "Questions about these terms",
        body: "If anything here is unclear, get in touch.",
      }}
    />
  );
}
