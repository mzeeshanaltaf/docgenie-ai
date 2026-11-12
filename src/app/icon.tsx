import { ImageResponse } from "next/og";
import { BRAND_HEX } from "@/lib/brand";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// The mark reversed: paper lines on an ink square (same geometry as the
// wordmark, see lib/brand.ts and public/logo.svg).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: BRAND_HEX.ink,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 5,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 7h10M5 10h10M5 13h5.5"
            stroke={BRAND_HEX.paper}
            strokeWidth="1.75"
            strokeLinecap="square"
          />
        </svg>
      </div>
    ),
    size
  );
}
