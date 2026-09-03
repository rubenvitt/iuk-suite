import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit löst gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/zeichen/_db/schema.ts",
  out: "./src/app/m/zeichen/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/zeichen.db" },
} satisfies Config;
