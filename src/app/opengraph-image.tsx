import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "DocGenie — Chat With Your Documents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #020817 0%, #0f2027 50%, #0d2a1f 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Emerald glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            width: 600,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(16,185,129,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Icon badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "rgba(16,185,129,0.15)",
            border: "1.5px solid rgba(16,185,129,0.4)",
            marginBottom: 28,
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>

        {/* Brand name */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-2px",
            lineHeight: 1,
          }}
        >
          DocGenie
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.55)",
            marginTop: 16,
            letterSpacing: "-0.5px",
          }}
        >
          Chat with your documents using AI
        </div>

        {/* Pills */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 36,
          }}
        >
          {["PDF", "DOCX", "TXT", "CSV"].map((ext) => (
            <div
              key={ext}
              style={{
                padding: "6px 16px",
                borderRadius: 999,
                background: "rgba(16,185,129,0.12)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#10b981",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {ext}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            color: "rgba(255,255,255,0.25)",
            fontSize: 18,
            letterSpacing: "0.5px",
          }}
        >
          docgenie.zeeshanai.cloud
        </div>
      </div>
    ),
    size
  );
}
