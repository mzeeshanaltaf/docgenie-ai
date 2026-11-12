/** One line of the credit ledger, in words. Shared by the Overview and Settings. */
export function ledgerLabel(
  kind: "signup" | "usage" | "refund",
  unit: "document" | "message"
): string {
  if (kind === "signup") return unit === "document" ? "Signup document credits" : "Signup message credits";
  if (kind === "refund") return unit === "document" ? "Document refunded" : "Message refunded";
  return unit === "document" ? "Document uploaded" : "Chat message";
}
