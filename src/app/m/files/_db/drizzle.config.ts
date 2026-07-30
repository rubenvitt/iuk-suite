import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit löst gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/files/_db/schema.ts",
  out: "./src/app/m/files/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/files.db" },
} satisfies Config;
