/**
 * Contradiction noise filters — PostgreSQL POSIX regex patterns (case-insensitive).
 *
 * Each pattern is applied as:
 *   AND NOT (statement_text ~* '<pattern>')
 *
 * Rules:
 *   - Use POSIX character classes ([0-9], [a-z]) — PostgreSQL does NOT support \d, \w, etc.
 *   - Separate alternatives within a single topic with |
 *   - To add new filters, append a string to this array; nothing else needs to change.
 */
export const CONTRADICTION_FILTERS: string[] = [
  // Episode-number artifacts — transcript metadata leaking into statement text
  "episode [0-9]",

  // Sponsor reads — transcript mishearings of promo codes / ad copy
  "promo code|use code|sign up at|brought to you",

  // Intro / outro boilerplate
  "welcomes listeners|this is the.*podcast|i'm your host",

  // Episode milestone mentions (e.g. "100th episode", "500 episodes")
  "[0-9]{3,4}th episode|[0-9]{3,4} episodes",
];
