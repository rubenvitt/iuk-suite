import { resolveHost } from "@/core/routing";

/**
 * Die öffentliche Adresse des Einwurfs. Der Host kommt über `resolveHost` (`x-forwarded-host` vor `host`),
 * nie aus `req.url` — dieselbe Falle wie beim Dienstabend-QR (`README.md`, „Öffentlicher Host").
 */
export function einwurfUrlAus(headers: Headers, secret: string): string {
  const host = resolveHost(headers);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${host}/k/${secret}`;
}
