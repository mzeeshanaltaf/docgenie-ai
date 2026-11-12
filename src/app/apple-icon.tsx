import { ImageResponse } from "next/og";
import { BRAND_HEX } from "@/lib/brand";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Full-bleed ink square: iOS applies its own corner mask, so no radius here.
export default function AppleIcon() {
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
        }}
      >
        <svg width="112" height="112" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 7h10M5 10h10M5 13h5.5"
            stroke={BRAND_HEX.paper}
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      </div>
    ),
    size
  );
}
