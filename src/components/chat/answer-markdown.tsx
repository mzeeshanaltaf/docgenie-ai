"use client";

import { createContext, memo, useContext, useMemo, type ComponentProps } from "react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { useAuiState, type TextMessagePartComponent } from "@assistant-ui/react";
import remarkGfm from "remark-gfm";
import { citationFromSource, linkCitationMarkers, plainMath } from "@/lib/chat/citations";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types/api";
import { CitationMark } from "./citation-mark";
import { useOptionalViewer } from "./viewer-context";

type CitationsState = { citations: ReadonlyMap<number, Citation>; running: boolean };
const CitationsContext = createContext<CitationsState>({ citations: new Map(), running: false });

function Link({ href, children, ...rest }: ComponentProps<"a">) {
  const { citations, running } = useContext(CitationsContext);
  const viewer = useOptionalViewer();
  const match = href?.match(/^#cite-(\d+)$/);
  if (match) {
    const n = Number(match[1]);
    const c = citations.get(n);
    if (c) return <CitationMark citation={c} onOpen={viewer?.openCitation} />;
    // While streaming the citations have not arrived yet: show the number as a
    // quiet placeholder so the mark does not pop in at the end.
    return running ? (
      <span className="figure mx-0.5 inline-flex h-[1.15em] min-w-[1.6em] items-center justify-center rounded-xs border border-rule px-1 text-[0.6875rem] leading-none text-muted-foreground">
        {n}
      </span>
    ) : null;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand underline underline-offset-4 hover:text-brand-hover"
      {...rest}
    >
      {children}
    </a>
  );
}

// Overrides are module-level so react-markdown keeps stable component types
// while the text streams in.
const components = {
  a: Link,
  h1: (p: ComponentProps<"h1">) => (
    <h1 className="mt-6 mb-2 text-title first:mt-0" {...p} />
  ),
  h2: (p: ComponentProps<"h2">) => (
    <h2 className="mt-5 mb-2 text-title first:mt-0" {...p} />
  ),
  h3: (p: ComponentProps<"h3">) => (
    <h3 className="mt-4 mb-1 text-body font-semibold first:mt-0" {...p} />
  ),
  p: (p: ComponentProps<"p">) => <p className="my-3 first:mt-0 last:mb-0" {...p} />,
  ul: (p: ComponentProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-5 marker:text-muted-foreground" {...p} />
  ),
  ol: (p: ComponentProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-muted-foreground" {...p} />
  ),
  strong: (p: ComponentProps<"strong">) => <strong className="font-semibold" {...p} />,
  hr: () => <hr className="my-5 border-rule" />,
  blockquote: (p: ComponentProps<"blockquote">) => (
    <blockquote className="my-3 border border-rule bg-muted px-3 py-2 text-muted-foreground" {...p} />
  ),
  pre: (p: ComponentProps<"pre">) => (
    <pre
      className="figure my-3 overflow-x-auto rounded-md border border-rule bg-muted p-3 text-[0.8125rem] leading-[1.54]"
      {...p}
    />
  ),
  code: ({ className, ...p }: ComponentProps<"code">) => (
    <code
      className={cn(
        "figure rounded-xs bg-muted px-1 py-0.5 text-[0.8125rem] in-[pre]:bg-transparent in-[pre]:p-0",
        className
      )}
      {...p}
    />
  ),
  table: (p: ComponentProps<"table">) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-body-sm" {...p} />
    </div>
  ),
  thead: (p: ComponentProps<"thead">) => <thead className="bg-muted" {...p} />,
  th: (p: ComponentProps<"th">) => (
    <th
      className="border-b border-rule-strong px-3 py-2 text-left text-body-sm font-semibold"
      {...p}
    />
  ),
  td: (p: ComponentProps<"td">) => (
    <td className="figure border-b border-rule px-3 py-2 align-top" {...p} />
  ),
};

/**
 * The answer text of an assistant message: Markdown, with `[n]` markers drawn
 * as citation marks that open the source in the document viewer.
 */
const AnswerTextImpl: TextMessagePartComponent = () => {
  const parts = useAuiState((s) => s.message.parts);
  const running = useAuiState((s) => s.message.status?.type === "running");

  const citations = useMemo(() => {
    const map = new Map<number, Citation>();
    for (const p of parts) {
      const c = citationFromSource(p);
      if (c) map.set(c.index, c);
    }
    return map;
  }, [parts]);

  // Citations arrive after the last text delta. Until then every well-formed
  // `[n]` is linked (and drawn as a placeholder); afterwards only matched ones.
  const preprocess = useMemo(
    () => (text: string) => {
      const known =
        citations.size > 0 || !running
          ? new Set(citations.keys())
          : new Set(Array.from({ length: 99 }, (_, i) => i + 1));
      return linkCitationMarkers(plainMath(text), known, running);
    },
    [citations, running]
  );

  const ctx = useMemo(() => ({ citations, running }), [citations, running]);

  return (
    <CitationsContext.Provider value={ctx}>
      <MarkdownTextPrimitive
        remarkPlugins={[remarkGfm]}
        components={components}
        preprocess={preprocess}
        className="text-body text-foreground wrap-break-word"
      />
    </CitationsContext.Provider>
  );
};

export const AnswerText = memo(AnswerTextImpl);
