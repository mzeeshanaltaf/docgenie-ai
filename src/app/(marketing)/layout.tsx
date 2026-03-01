import { DM_Serif_Display } from "next/font/google";

const displayFont = DM_Serif_Display({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={displayFont.variable}>{children}</div>;
}
