import {
  MAX_CSV_ROWS,
  MAX_UPLOAD_MB,
  MAX_UPLOAD_PAGES,
  OCR_MIN_CHARS_PER_PAGE,
  SIGNUP_DOCUMENT_CREDITS,
  SIGNUP_MESSAGE_CREDITS,
} from "@/lib/constants";

/**
 * Copy and figures for the landing page. Every number here is a value from
 * backend/app/config.py (the shared ones come from lib/constants.ts). When a
 * backend default changes, change it here. Copy rules: no em dashes, no heading
 * restated beneath itself.
 */

export const SITE_URL = "https://docgenie.zeeshanai.cloud";

/** Retrieval and agent tunables (backend/app/config.py), for the pipeline section. */
export const PIPELINE_CONFIG = {
  chunkChars: 1000,
  chunkOverlap: 200,
  embeddingModel: "text-embedding-3-small",
  embeddingDim: 1536,
  candidatesPerRanking: 30,
  rrfK: 60,
  topK: 8,
  agentMaxSteps: 8,
  queryMaxRows: 100,
  queryTimeoutS: 5,
  chatModel: "gpt-6-luna",
} as const;

export type PipelineStep = {
  id: string;
  name: string;
  body: string;
  figures: { label: string; value: string }[];
};

const P = PIPELINE_CONFIG;
const n = (v: number) => v.toLocaleString("en-US");

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "parse",
    name: "Parse",
    body: "Text is read page by page from PDF, DOCX and TXT files. CSV files are stored as rows, so they can be queried. A PDF with almost no text layer is sent through OCR instead.",
    figures: [
      { label: "Formats", value: "PDF, DOCX, TXT, CSV" },
      { label: "OCR below", value: `${OCR_MIN_CHARS_PER_PAGE} chars/page` },
    ],
  },
  {
    id: "chunk",
    name: "Chunk",
    body: "The text is cut into overlapping passages. Each one remembers its page range and gets an embedding, so a passage can be found by meaning and cited by page.",
    figures: [
      { label: "Passage", value: `${n(P.chunkChars)} chars` },
      { label: "Overlap", value: `${P.chunkOverlap} chars` },
      { label: "Embedding", value: `${n(P.embeddingDim)} dims` },
    ],
  },
  {
    id: "search",
    name: "Hybrid search",
    body: "Every question is searched twice: by meaning, with vector similarity, and by keyword, with Postgres full-text. The two rankings are merged with reciprocal rank fusion, so a passage that ranks well in both rises.",
    figures: [
      { label: "Candidates", value: `${P.candidatesPerRanking} per ranking` },
      { label: "RRF k", value: `${P.rrfK}` },
      { label: "Returned", value: `${P.topK} passages` },
    ],
  },
  {
    id: "agent",
    name: "Agent",
    body: "A model with four tools decides what to do: list the documents, search them, read one in full, or run a read-only SQL query over a CSV. It loops until it has what it needs, and every step is shown in the trace.",
    figures: [
      { label: "Tools", value: "4" },
      { label: "Max steps", value: `${P.agentMaxSteps}` },
      { label: "SQL cap", value: `${P.queryMaxRows} rows, ${P.queryTimeoutS} s` },
    ],
  },
  {
    id: "answer",
    name: "Cited answer",
    body: "The answer streams in with numbered markers. Each marker opens the original file at that page with the passage marked. Under every answer sit its first-token time, total time and tokens per second.",
    figures: [
      { label: "Marker", value: "one per source" },
      { label: "Timing", value: "every answer" },
    ],
  },
];

/** The "what it handles" table: one row per format. */
export const FORMAT_ROWS: { format: string; how: string; limit: string }[] = [
  {
    format: "PDF",
    how: "Text layer when there is one. A scan, with almost no text, is read with OCR.",
    limit: `${MAX_UPLOAD_PAGES} pages`,
  },
  {
    format: "DOCX",
    how: "Text is extracted and split into passages. Page numbers are approximate.",
    limit: `${MAX_UPLOAD_PAGES} pages`,
  },
  {
    format: "TXT",
    how: "Plain text, split into passages. Page numbers are approximate.",
    limit: `${MAX_UPLOAD_PAGES} pages`,
  },
  {
    format: "CSV",
    how: "Stored as rows. Numeric questions run as a SQL query over the table, not as a guess.",
    limit: `${n(MAX_CSV_ROWS)} rows`,
  },
];

export const FILE_LIMIT = `${MAX_UPLOAD_MB} MB`;

/** "Under the hood": engineering choices, written for a technical reader. */
export const STACK_NOTES: { title: string; body: string }[] = [
  {
    title: "A private backend",
    body: "A FastAPI service owns credits, ingestion, retrieval and the agent. The browser never reaches it: Next.js route handlers resolve the session and forward each request with an internal key and the user id.",
  },
  {
    title: "Retrieval in Postgres",
    body: `Passages, embeddings (pgvector) and a generated full-text vector sit in one table, so semantic and keyword search are two queries over the same rows. Embeddings come from ${P.embeddingModel}.`,
  },
  {
    title: "A hand-written tool loop",
    body: `The agent is a short loop on the OpenAI Responses API, with no agent framework. Calls are stateless (store=false), reasoning summaries are streamed to the UI, and the loop stops after ${P.agentMaxSteps} steps. The model is ${P.chatModel}.`,
  },
  {
    title: "SQL the model cannot abuse",
    body: `Generated SQL is parsed, checked against an allowlist of one SELECT and a fixed set of functions, rewritten from the parsed tree, and run in a read-only transaction with a ${P.queryTimeoutS} s timeout and a ${P.queryMaxRows}-row cap.`,
  },
  {
    title: "One stream, end to end",
    body: "The chat is server-sent events from FastAPI, piped unchanged through Next.js, and read by an assistant-ui adapter. Reasoning, tool calls, text, citations and metrics are separate event types.",
  },
  {
    title: "Credits that are reserved, then refunded",
    body: "A credit is reserved atomically before the work starts and refunded if an upload fails or an answer produces no text. The ledger records every movement.",
  },
  {
    title: "Files stay in your account",
    body: "Originals live in private S3-compatible storage under a per-user prefix. Settings can export everything as a zip, or delete the account along with its files.",
  },
];

export const STACK_TAGS = [
  "Next.js 16",
  "React 19",
  "assistant-ui",
  "Better Auth",
  "FastAPI",
  "Postgres + pgvector",
  "MinIO",
  "OpenAI Responses API",
] as const;

export const PREVIEW_ROWS: { label: string; value: string; note: string }[] = [
  {
    label: "Documents",
    value: `${SIGNUP_DOCUMENT_CREDITS}`,
    note: "One per upload. Given back if the file cannot be read.",
  },
  {
    label: "Messages",
    value: `${SIGNUP_MESSAGE_CREDITS}`,
    note: "One per answer. Given back if no answer comes.",
  },
  {
    label: "Cost",
    value: "$0",
    note: "No card is asked for, and there is no paid plan.",
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "What can I upload?",
    a: `PDF, DOCX, TXT and CSV files, up to ${MAX_UPLOAD_MB} MB each. PDFs, DOCX and TXT files can run to ${MAX_UPLOAD_PAGES} pages, and CSV files to ${n(MAX_CSV_ROWS)} rows. Scanned PDFs are read with OCR.`,
  },
  {
    q: "How long does a document take to process?",
    a: "It depends on its length and on whether it needs OCR. A new document shows as Processing and changes to Ready when you can ask about it. If processing fails, the card says why and the credit is refunded.",
  },
  {
    q: "How do I know an answer is right?",
    a: "Each claim carries a numbered marker. Click it to open the original at that page with the passage marked, and read it yourself. The model can still misread a passage, so check anything that matters.",
  },
  {
    q: "Is my data private?",
    a: "Your files are kept in private storage under your account. To answer a question, DocGenie sends the question and the relevant passages to OpenAI, with storage turned off on those requests. You can delete any document, export your data, or delete your account from Settings. The privacy policy has the details.",
  },
  {
    q: "How do credits work?",
    a: `A new account gets ${SIGNUP_DOCUMENT_CREDITS} document credits and ${SIGNUP_MESSAGE_CREDITS} message credits. An upload costs one document credit and an answer costs one message credit. Failed uploads and answers that produce no text are refunded. There is no way to buy more.`,
  },
  {
    q: "Can I ask across several documents?",
    a: "Yes. A chat searches all your documents by default, or only the ones you pick for that chat.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. The chat, the document list and the source viewer all work at phone width.",
  },
];

export const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DocGenie",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Chat with PDF, DOCX, TXT and CSV files. Each answer cites the page it came from and opens the original on click.",
  featureList: [
    "Answers cite the page they came from",
    "Hybrid semantic and keyword search",
    "OCR for scanned PDFs",
    "SQL queries over CSV files",
    "Visible tool calls and timings",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: `Free preview: ${SIGNUP_DOCUMENT_CREDITS} document credits and ${SIGNUP_MESSAGE_CREDITS} message credits`,
  },
};

export const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};
