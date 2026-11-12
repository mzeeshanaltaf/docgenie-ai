import { ImageResponse } from "next/og";
import { BRAND_HEX as C } from "@/lib/brand";
import {
  MAX_UPLOAD_MB,
  MAX_UPLOAD_PAGES,
  SIGNUP_DOCUMENT_CREDITS,
  SIGNUP_MESSAGE_CREDITS,
} from "@/lib/constants";

export const runtime = "edge";
export const alt = "DocGenie: ask your documents, check the source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FACTS: [string, string][] = [
  ["FORMATS", "PDF, DOCX, TXT, CSV"],
  ["PER FILE", `${MAX_UPLOAD_MB} MB, ${MAX_UPLOAD_PAGES} pages`],
  ["FREE PREVIEW", `${SIGNUP_DOCUMENT_CREDITS} documents, ${SIGNUP_MESSAGE_CREDITS} messages`],
];

// Paper, ink and one red mark. The same grammar as the site: hairline rules,
// a legend over each figure, and a citation mark where the answer came from.
export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: C.paper,
          color: C.ink,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="40" height="40" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="18" height="18" rx="2" stroke={C.ink} strokeWidth="1.5" />
            <path d="M6 7h8M6 10h8M6 13h4" stroke={C.ink} strokeWidth="1.5" strokeLinecap="square" />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-1px" }}>DocGenie</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-3px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div>Ask your documents.</div>
            <div>Check the source.</div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 36,
              fontSize: 30,
              color: C.inkSoft,
            }}
          >
            <div>Invoices are due within 30 days of receipt.</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 10,
                width: 34,
                height: 34,
                fontSize: 22,
                fontWeight: 700,
                color: C.vermilion,
                background: C.vermilionTint,
                border: `2px solid ${C.vermilion}`,
                borderRadius: 3,
              }}
            >
              1
            </div>
          </div>
        </div>

        <div style={{ display: "flex", borderTop: `2px solid ${C.rule}`, paddingTop: 20 }}>
          {FACTS.map(([label, value]) => (
            <div
              key={label}
              style={{ display: "flex", flexDirection: "column", marginRight: 64 }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "2px", color: C.inkSoft }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
