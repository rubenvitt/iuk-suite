import { findModule } from "@/core/registry";

/**
 * URL, unter der ein Modul erreichbar ist — oder null, wenn es das nicht ist.
 *
 * In Prod zählt allein der `prodHost` aus der Registry: kein Eintrag heißt, dass
 * die Domain noch nicht auf die Suite zeigt (oder es nie eine geben wird, wie
 * bei den Wegwerf-Modulen). Dann gibt es keinen Link statt eines toten.
 * In Dev/Test bleibt es beim wildcard-DNS-Schema `<key>.localtest.me`.
 */
export function moduleUrl(key: string): string | null {
  const mod = findModule(key);
  if (!mod) return null;

  if (process.env.NODE_ENV === "production") {
    const host = mod.prodHosts[0];
    return host ? `https://${host}` : null;
  }

  const port = process.env.PORT ?? "3000";
  const base = process.env.SUITE_DEV_HOST_SUFFIX ?? "localtest.me";
  return `http://${mod.key}.${base}:${port}`;
}
