import { leserGruppe } from "./zugang";

type EnvLike = Record<string, string | undefined>;

export type LeserTransport = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * DIE NAMEN AUF DEM EINWURF (Entscheidung 2026-11-01): „Es lesen nur: …" nennt die Mitglieder der
 * Lesegruppe, so wie Pocket ID sie führt — keine zweite Liste, die man pflegen und vergessen kann.
 *
 * `GET /api/user-groups?search=<name>` findet die Gruppe, `GET /api/user-groups/<id>` liefert sie samt
 * `users`. Fünf Minuten zwischengespeichert; ein Fehler wird nie gespeichert, dann gilt der letzte gute
 * Stand nur innerhalb der TTL und der nächste Abruf frühestens nach 30 Sekunden. Sonst ist die Liste
 * leer, und die Seiten lassen die Zeile weg, statt Namen zu erfinden oder zu verschweigen. Wirft nie.
 */
const TTL_MS = 5 * 60_000;
const FEHLER_SPERRE_MS = 30_000;
const TIMEOUT_MS = 5_000;

let stand: { namen: string[]; am: number } | null = null;
let gesperrtBis = 0;

/** Nur für Tests. */
export function _leserZuruecksetzen(): void {
  stand = null;
  gesperrtBis = 0;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

export function nameVon(roh: unknown): string | null {
  if (typeof roh !== "object" || roh === null) return null;
  const u = roh as Record<string, unknown>;
  if (u.disabled === true) return null;
  const voll = [text(u.firstName), text(u.lastName)].filter(Boolean).join(" ");
  return text(u.displayName) || voll || text(u.username) || null;
}

async function holeJson(transport: LeserTransport, url: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await transport(url, { headers: { "X-API-KEY": apiKey, Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`Pocket ID antwortet ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function ladeLeserNamen(
  env: EnvLike = process.env,
  transport: LeserTransport = (url, init) => fetch(url, init),
  jetzt: number = Date.now(),
): Promise<string[]> {
  if (stand && jetzt - stand.am < TTL_MS) return stand.namen;
  if (jetzt < gesperrtBis) return frischeNamen(jetzt);
  const basis = (env.POCKET_ID_API_URL?.trim() || env.POCKET_ID_ISSUER || "").trim().replace(/\/+$/, "");
  const apiKey = (env.POCKET_ID_API_KEY ?? "").trim();
  // Der Schlüssel geht nur über HTTPS hinaus.
  if (!basis.startsWith("https://") || apiKey === "") return [];
  const gruppe = leserGruppe(env);
  try {
    const suche = (await holeJson(transport, `${basis}/api/user-groups?${new URLSearchParams({ search: gruppe, "pagination[limit]": "100" })}`, apiKey)) as { data?: unknown };
    const treffer = (Array.isArray(suche.data) ? suche.data : []).find(
      (g) => typeof g === "object" && g !== null && text((g as Record<string, unknown>).name) === gruppe,
    ) as Record<string, unknown> | undefined;
    let namen: string[] = [];
    if (treffer && text(treffer.id)) {
      const voll = (await holeJson(transport, `${basis}/api/user-groups/${encodeURIComponent(text(treffer.id))}`, apiKey)) as { users?: unknown };
      namen = (Array.isArray(voll.users) ? voll.users : [])
        .map(nameVon)
        .filter((n): n is string => n !== null)
        .sort((a, b) => a.localeCompare(b, "de"));
    }
    stand = { namen, am: jetzt };
    return namen;
  } catch (fehler) {
    gesperrtBis = jetzt + FEHLER_SPERRE_MS;
    console.error("[feedback][ehrlich] Lesegruppe nicht ladbar:", fehler instanceof Error ? fehler.message : fehler);
    return frischeNamen(jetzt);
  }
}

/** Nach einem Fehler nur eine Liste, die noch in der TTL liegt: „Es lesen nur" darf kein neues Mitglied verschweigen. */
function frischeNamen(jetzt: number): string[] {
  return stand && jetzt - stand.am < TTL_MS ? stand.namen : [];
}

/** „A", „A und B", „A, B und C". */
export function namensreihe(namen: readonly string[], und = "und"): string {
  if (namen.length <= 1) return namen[0] ?? "";
  return `${namen.slice(0, -1).join(", ")} ${und} ${namen[namen.length - 1]}`;
}
