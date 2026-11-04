import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht
// relativ zu dieser Datei.
export default {
  schema: "./src/app/m/verpflegung/_db/schema.ts",
  out: "./src/app/m/verpflegung/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/verpflegung.db" },
} satisfies Config;
