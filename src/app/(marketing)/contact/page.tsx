import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send a question, a bug report or feedback about DocGenie.",
  alternates: { canonical: "/contact" },
};

// Short error codes set by the API route's redirect (?error=...) mapped to
// human-readable copy. Keep keys in sync with the route handler's fail() calls.
const ERROR_MESSAGES: Record<string, string> = {
  fields: "Please fill in all fields.",
  email: "Please enter a valid email address.",
  length: "Message must be 1000 characters or fewer.",
  rate: "Too many submissions. Please try again later.",
  server: "Service is temporarily unavailable. Please try again later.",
  parse: "Invalid submission. Please try again.",
};

type Props = {
  searchParams: Promise<{ sent?: string; error?: string }>;
};

export default async function ContactPage({ searchParams }: Props) {
  const { sent, error } = await searchParams;
  const initialError = error
    ? ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."
    : undefined;

  return (
    <MarketingPage>
      <div className="page-container pt-12 pb-24 md:pt-16 md:pb-32">
        <div className="page-grid gap-y-10">
          <header className="col-span-4 md:col-span-12 lg:col-span-5">
            <h1 className="text-section text-balance">Send a message</h1>
            <p className="measure mt-4 max-w-sm text-body text-muted-foreground">
              Questions, bug reports and feedback are all welcome. Say what you were doing and what
              you expected, and a reply goes to the email address you give.
            </p>
          </header>

          <div className="col-span-4 md:col-span-8 md:col-start-3 lg:col-span-5 lg:col-start-8 lg:border-l lg:border-rule lg:pl-12">
            <div className="max-w-md">
              <ContactForm initialSuccess={!!sent} initialError={initialError} />
            </div>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
