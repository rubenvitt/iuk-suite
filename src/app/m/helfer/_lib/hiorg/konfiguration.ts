/**
 * Die Anbindung an HiOrg-Server aus der Umgebung. Das Client-Secret steht NUR hier, nie in der
 * Datenbank. Den Client vergibt der HiOrg-Support auf Antrag des Account-Inhabers
 * (https://wiki.hiorg-server.de/admin/oauth2), beschränkt auf das Organisations-Kürzel.
 *
 * Belegte Eckdaten (https://api.hiorg-server.de/.well-known/openid-configuration, 20.10.2026):
 * Grant-Types nur `authorization_code` und `refresh_token`, Client-Authentifizierung
 * `client_secret_post`. Es gibt also keinen Server-zu-Server-Zugang ohne einmalige Anmeldung.
 */
import { moduleUrl } from "@/core/shell/moduleUrl";
import { schluesselAusUmgebung } from "./tresor";

type EnvLike = Record<string, string | undefined>;

export const HIORG_VARIABLEN = {
  clientId: "HELFER_HIORG_CLIENT_ID",
  clientSecret: "HELFER_HIORG_CLIENT_SECRET",
  organisation: "HELFER_HIORG_ORGANISATION",
  basis: "HELFER_HIORG_API",
} as const;

/** Scope `personal:read` liefert die Personalliste samt Qualifikationen, `openid` den Kontonamen. */
export const HIORG_SCOPE = "openid personal:read";
const STANDARD_BASIS = "https://api.hiorg-server.de";

export interface HiorgKonfiguration {
  clientId: string;
  clientSecret: string;
  /** Organisations-Kürzel; vorbelegt im Anmeldedialog (`?ov=`), sonst fragt HiOrg danach. */
  organisation: string | null;
  basis: string;
  callbackUrl: string;
}

export type Konfigurationsstand =
  | { ok: true; konfiguration: HiorgKonfiguration }
  | { ok: false; fehlt: string[] };

/** Was fehlt, damit verbunden werden kann — als Variablennamen für den Hinweis in der Oberfläche. */
export function hiorgKonfiguration(env: EnvLike = process.env): Konfigurationsstand {
  const clientId = env[HIORG_VARIABLEN.clientId]?.trim() ?? "";
  const clientSecret = env[HIORG_VARIABLEN.clientSecret]?.trim() ?? "";
  const fehlt: string[] = [];
  if (!clientId) fehlt.push(HIORG_VARIABLEN.clientId);
  if (!clientSecret) fehlt.push(HIORG_VARIABLEN.clientSecret);
  const schluessel = schluesselAusUmgebung(env);
  if (schluessel.status !== "ok") fehlt.push(`HELFER_SCHLUESSEL (${schluessel.status === "fehlt" ? "fehlt" : "keine 32 Byte Base64"})`);
  const basis = (env[HIORG_VARIABLEN.basis]?.trim() || STANDARD_BASIS).replace(/\/+$/, "");
  const modul = moduleUrl("helfer");
  if (!modul) fehlt.push("SUITE_HOST_HELFER");
  if (fehlt.length > 0 || !modul) return { ok: false, fehlt };
  return {
    ok: true,
    konfiguration: {
      clientId, clientSecret, basis,
      organisation: env[HIORG_VARIABLEN.organisation]?.trim() || null,
      callbackUrl: `${modul}/hiorg/callback`,
    },
  };
}
