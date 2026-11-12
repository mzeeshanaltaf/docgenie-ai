import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge only knows Tailwind's own font sizes. Without this, the type
 * scale in globals.css (`text-caption`, `text-body-sm`, ...) is taken for a
 * text colour, and `cn("text-caption", "text-muted-foreground")` drops the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["label", "caption", "body-sm", "body", "title", "headline", "section", "display"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
