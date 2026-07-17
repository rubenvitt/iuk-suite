import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/app/m/portal/_db/schema.ts",
  out: "./src/app/m/portal/_db/migrations",
  dbCredentials: { url: "./.data/portal.db" },
});
