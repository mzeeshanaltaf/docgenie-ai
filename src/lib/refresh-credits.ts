/**
 * Dispatch a custom event to tell CreditDisplay to re-fetch the balance.
 * Call this after any action that consumes credits (upload, match, screen).
 */
export function refreshCredits() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("credits:refresh"));
  }
}
