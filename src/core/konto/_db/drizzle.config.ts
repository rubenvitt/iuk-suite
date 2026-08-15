import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht
// relativ zu dieser Datei.
export default {
  schema: "./src/core/konto/_db/schema.ts",
  out: "./src/core/konto/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/konto.db" },
} satisfies Config;
