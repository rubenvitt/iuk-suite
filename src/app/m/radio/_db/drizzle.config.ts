// src/app/m/radio/_db/drizzle.config.ts
// Pfade repo-root-relativ (drizzle-kit loest gegen cwd auf), nicht relativ zu dieser Datei.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/app/m/radio/_db/schema.ts",
  out: "./src/app/m/radio/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/radio.db" },
} satisfies Config;
