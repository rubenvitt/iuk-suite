import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht
// relativ zu dieser Datei.
export default {
  schema: "./src/app/m/helfer/_db/schema.ts",
  out: "./src/app/m/helfer/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/helfer.db" },
} satisfies Config;
