import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the DocGenie team — questions, feedback, bug reports, or sales enquiries.",
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
    <>
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Get in touch
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Have a question, some feedback, or a sales enquiry? Send us a
            message and we&apos;ll respond as soon as possible.
          </p>
        </div>

        <div className="rounded-2xl border p-6 sm:p-8">
          <ContactForm initialSuccess={!!sent} initialError={initialError} />
        </div>
      </main>
      <Footer />
    </>
  );
}
