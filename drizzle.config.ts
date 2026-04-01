import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// IMPORTANT: drizzle-kit push is BANNED in all automated scripts (post-merge, CI, deploy hooks, etc.).
// Reason: `push` computes a diff and applies it destructively — it can silently DROP columns that exist
// in the database but are absent from the Drizzle schema. The `embedding_vector` column on the
// `statements` table is one such column: it is a pgvector column managed directly in the database
// (via a raw SQL migration) and is intentionally NOT declared in shared/schema.ts. Running `push`
// would drop it and destroy all stored embeddings.
//
// Use `drizzle-kit generate` + `drizzle-kit migrate` instead:
//   - `generate` produces a SQL migration file that can be inspected before application.
//   - `migrate` applies only pre-approved, human-reviewed SQL migrations from the ./migrations folder.
// This ensures schema changes are explicit, reviewable, and never destructive by accident.

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
