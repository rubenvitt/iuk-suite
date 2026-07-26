import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit löst gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/feedback/_db/schema.ts",
  out: "./src/app/m/feedback/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/feedback.db" },
} satisfies Config;
