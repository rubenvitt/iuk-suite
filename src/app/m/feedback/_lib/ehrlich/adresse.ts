import { EINSTIEGSHOSTS, einstiegFuerHost, einstiegsHostAusEnv } from "@/core/registry";
import { resolveHost } from "@/core/routing";

type EnvLike = Record<string, string | undefined>;

const EINSTIEG = EINSTIEGSHOSTS.find((e) => e.modul === "feedback")!;

/** Der öffentliche Host des Einwurfs (IDA-340, `SUITE_EINSTIEG_HOST_EHRLICH`), sonst null. */
export function oeffentlicherEinwurfHost(env: EnvLike = process.env): string | null {
  return einstiegsHostAusEnv(EINSTIEG, env);
}

/** Kam die Anfrage über den Einstiegshost von „Ehrlich gesagt"? Lokal zählt `devHost`. */
export function istEhrlichEinstieg(headers: Headers, env: EnvLike = process.env): boolean {
  return einstiegFuerHost(resolveHost(headers), env) === EINSTIEG;
}

/** Der Pfad zum Abholen aus Sicht des aufgerufenen Hosts: der Einstiegshost bedient nur `/k/…`. */
export function abholenPfad(headers: Headers, env: EnvLike = process.env): string {
  return istEhrlichEinstieg(headers, env) ? "/abholen" : "/k/abholen";
}

/**
 * Die öffentliche Adresse des Einwurfs für QR-Code und Aushang. Mit Einstiegshost dessen Wurzel (https, ohne
 * Secret); sonst der Secret-Link auf dem aufgerufenen Host. Der Host kommt über `resolveHost`
 * (`x-forwarded-host` vor `host`), nie aus `req.url` — dieselbe Falle wie beim Dienstabend-QR (`README.md`,
 * „Öffentlicher Host").
 */
export function einwurfUrlAus(headers: Headers, secret: string, env: EnvLike = process.env): string {
  const oeffentlich = oeffentlicherEinwurfHost(env);
  if (oeffentlich) return `https://${oeffentlich}/`;
  const host = resolveHost(headers);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${host}/k/${secret}`;
}
