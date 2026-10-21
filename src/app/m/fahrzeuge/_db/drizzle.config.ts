import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht
// relativ zu dieser Datei.
export default {
  schema: "./src/app/m/fahrzeuge/_db/schema.ts",
  out: "./src/app/m/fahrzeuge/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/fahrzeuge.db" },
} satisfies Config;
