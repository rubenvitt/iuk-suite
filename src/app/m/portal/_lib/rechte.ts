import { MODULES, requiredGroupsFor } from "@/core/registry";
import { adminGroupsFor, suiteAdminGroup } from "@/core/groups";

/**
 * NUTZERRECHTE VERGEBEN (IDA-253): wer in welcher Pocket-ID-Gruppe ist, aus der Portal-Verwaltung.
 *
 * Die Rechte der Suite SIND Pocket-ID-Gruppen (`core/groups`, `core/registry`); diese Datei legt keine
 * zweite Rechteliste an, sondern liest beide Quellen und ordnet sie einander zu: die Registry sagt, welche
 * Gruppe in welchem Modul was bedeutet, Pocket ID sagt, wer drin ist. Was Pocket ID kennt und die Registry
 * nicht (Tailscale, uav-signatures …), steht als „Weitere Gruppen" daneben — vergeben lässt es sich trotzdem.
 *
 * Geschrieben wird über `PUT /api/users/{id}/user-groups` (`userGroupIds`, die GANZE Menge der Person).
 * Deshalb liest `setzeMitgliedschaft` die Gruppen der Person unmittelbar vorher frisch und ändert genau eine:
 * zwei Verwaltende, die gleichzeitig an derselben Person schalten, überschreiben sich so nur im Abstand
 * eines Abrufs, nicht im Abstand eines Seitenaufbaus.
 *
 * Wirkung bei der Person: die Gruppen stehen im Sitzungs-Token und sind nur so frisch wie dessen letzte
 * Auffrischung (CLAUDE.md, „Zugriffsschutz"; Takt ≈ 1 Stunde).
 */

type EnvLike = Record<string, string | undefined>;

export type PocketIdTransport = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type PocketGruppe = { id: string; name: string; anzeige: string; ldap: boolean };
export type PocketPerson = { id: string; name: string; email: string | null; gruppenIds: string[]; gesperrt: boolean };

export type RolleArt = "betrieb" | "nutzer" | "admin" | "updater";
export type Rolle = { art: RolleArt; gruppe: PocketGruppe };
export type Abschnitt = { schluessel: string; titel: string; rollen: Rolle[] };

const SEITENGROESSE = 100;
const MAX_SEITEN = 20;
const TIMEOUT_MS = 5_000;

export const ROLLEN_TEXT: Record<RolleArt, string> = {
  betrieb: "Betrieb: verwaltet jedes Modul, liest das Audit-Log und vergibt Rechte",
  nutzer: "Nutzer: darf das Modul benutzen",
  admin: "Verwaltung: darf das Modul verwalten",
  updater: "Software-Update: darf Funkgeräte aktualisieren",
};

/** Die Updater-Gruppe von radio — dieselbe Lesart wie `updaterGruppe()` in `radio/_lib/zugang.ts`. */
function updaterGruppe(env: EnvLike): string | null {
  const roh = env.SUITE_UPDATER_GROUP_RADIO?.trim();
  return roh ? roh : null;
}

/**
 * Ordnet die Gruppen aus Pocket ID den Rollen der Suite zu. Eine Rolle erscheint nur, wenn ihre Gruppe in
 * Pocket ID existiert — eine Registry-Vorgabe ohne Gruppe (Demo-Module, ein noch nicht angelegtes Modul)
 * hätte niemanden zum Hinzufügen. Steht während einer Umbenennung „alt,neu" in der `.env`, erscheinen
 * beide Gruppen, solange beide existieren.
 */
export function rechteKatalog(
  gruppen: readonly PocketGruppe[],
  env: EnvLike = process.env,
): { abschnitte: Abschnitt[]; weitere: PocketGruppe[] } {
  const nachName = new Map(gruppen.map((g) => [g.name, g]));
  const vergeben = new Set<string>();
  const rollen = (art: RolleArt, namen: readonly string[]): Rolle[] =>
    namen.flatMap((name) => {
      const gruppe = nachName.get(name);
      if (!gruppe) return [];
      vergeben.add(gruppe.id);
      return [{ art, gruppe }];
    });

  const abschnitte: Abschnitt[] = [];
  const betrieb = rollen("betrieb", [suiteAdminGroup(env)]);
  if (betrieb.length > 0) abschnitte.push({ schluessel: "suite", titel: "Suite", rollen: betrieb });

  for (const mod of MODULES) {
    if (!mod.showInSwitcher) continue;
    const updater = mod.key === "radio" ? updaterGruppe(env) : null;
    const liste = [
      ...rollen("nutzer", requiredGroupsFor(mod, env)),
      ...rollen("admin", adminGroupsFor(mod, env)),
      ...(updater ? rollen("updater", [updater]) : []),
    ];
    // Dieselbe Gruppe kann Zugang und Verwaltung zugleich sein (heute: files) — dann einmal, als Verwaltung.
    const verwaltend = new Set(liste.filter((r) => r.art !== "nutzer").map((r) => r.gruppe.id));
    const eindeutig = liste.filter(
      (r, i) =>
        !(r.art === "nutzer" && verwaltend.has(r.gruppe.id)) &&
        liste.findIndex((s) => s.gruppe.id === r.gruppe.id && s.art === r.art) === i,
    );
    if (eindeutig.length > 0) abschnitte.push({ schluessel: mod.key, titel: mod.title, rollen: eindeutig });
  }

  const weitere = gruppen
    .filter((g) => !vergeben.has(g.id))
    .sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de"));
  return { abschnitte, weitere };
}

function basisUndSchluessel(env: EnvLike): { basis: string; apiKey: string } | null {
  const basis = (env.POCKET_ID_API_URL ?? env.POCKET_ID_ISSUER ?? "").trim().replace(/\/+$/, "");
  const apiKey = (env.POCKET_ID_API_KEY ?? "").trim();
  return basis === "" || apiKey === "" ? null : { basis, apiKey };
}

export function istPocketIdKonfiguriert(env: EnvLike = process.env): boolean {
  return basisUndSchluessel(env) !== null;
}

async function abruf(
  transport: PocketIdTransport,
  url: string,
  apiKey: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await transport(url, {
      method: init.method ?? "GET",
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Pocket ID: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function seitenweise(
  transport: PocketIdTransport,
  basis: string,
  pfad: string,
  apiKey: string,
): Promise<unknown[]> {
  const alle: unknown[] = [];
  let seiten = 1;
  for (let seite = 1; seite <= Math.min(seiten, MAX_SEITEN); seite += 1) {
    const params = new URLSearchParams({
      "pagination[page]": String(seite),
      "pagination[limit]": String(SEITENGROESSE),
    });
    const daten = (await abruf(transport, `${basis}${pfad}?${params}`, apiKey)) as {
      data?: unknown;
      pagination?: { totalPages?: unknown };
    };
    if (Array.isArray(daten.data)) alle.push(...daten.data);
    const gesamt = daten.pagination?.totalPages;
    if (typeof gesamt === "number" && Number.isFinite(gesamt)) seiten = Math.max(1, gesamt);
  }
  return alle;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

export function gruppeAus(roh: unknown): PocketGruppe | null {
  if (typeof roh !== "object" || roh === null) return null;
  const g = roh as Record<string, unknown>;
  const id = text(g.id);
  const name = text(g.name);
  if (id === "" || name === "") return null;
  return { id, name, anzeige: text(g.friendlyName) || name, ldap: typeof g.ldapId === "string" && g.ldapId !== "" };
}

export function personAus(roh: unknown): PocketPerson | null {
  if (typeof roh !== "object" || roh === null) return null;
  const p = roh as Record<string, unknown>;
  const id = text(p.id);
  if (id === "") return null;
  const voll = [text(p.firstName), text(p.lastName)].filter(Boolean).join(" ");
  const name = text(p.displayName) || voll || text(p.username) || id;
  const gruppen = Array.isArray(p.userGroups) ? p.userGroups.map(gruppeAus).filter((g) => g !== null) : [];
  return {
    id,
    name,
    email: text(p.email) || null,
    gruppenIds: gruppen.map((g) => g.id),
    gesperrt: p.disabled === true,
  };
}

export type RechteDaten =
  | { status: "ok"; gruppen: PocketGruppe[]; personen: PocketPerson[] }
  | { status: "unconfigured" | "error"; gruppen: []; personen: [] };

/** Gruppen und Personen samt Mitgliedschaften. Wirft nie: ein Ausfall wird ein Zustand der Seite. */
export async function ladeRechte(
  env: EnvLike = process.env,
  transport: PocketIdTransport = (url, init) => fetch(url, init),
): Promise<RechteDaten> {
  const zugang = basisUndSchluessel(env);
  if (!zugang) return { status: "unconfigured", gruppen: [], personen: [] };
  try {
    const [gruppenRoh, personenRoh] = await Promise.all([
      seitenweise(transport, zugang.basis, "/api/user-groups", zugang.apiKey),
      seitenweise(transport, zugang.basis, "/api/users", zugang.apiKey),
    ]);
    const gruppen = gruppenRoh.map(gruppeAus).filter((g) => g !== null);
    const personen = personenRoh
      .map(personAus)
      .filter((p) => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    return { status: "ok", gruppen, personen };
  } catch (fehler) {
    console.error("[portal][rechte] Pocket ID nicht ladbar:", fehler);
    return { status: "error", gruppen: [], personen: [] };
  }
}

export class RechteFehler extends Error {}

/**
 * Nimmt eine Person in eine Gruppe auf oder aus ihr heraus. Liest Person und Gruppe frisch aus Pocket ID —
 * eine Kennung aus dem Formular gilt erst, wenn es sie dort gibt. Gibt zurück, ob sich etwas geändert hat.
 *
 * Zwei Riegel, die die Oberfläche auch zeigt, aber nicht allein trägt:
 * - eine aus LDAP gespiegelte Gruppe ändert Pocket ID beim nächsten Abgleich zurück — also gar nicht;
 * - wer verwaltet, nimmt sich nicht selbst die Suite-Betriebsgruppe (sonst ist die Seite danach für
 *   niemanden mehr erreichbar, der den Fehler zurücknehmen könnte).
 */
export async function setzeMitgliedschaft(
  eingabe: { personId: string; gruppeId: string; mitglied: boolean; selbstId: string },
  env: EnvLike = process.env,
  transport: PocketIdTransport = (url, init) => fetch(url, init),
): Promise<{ geaendert: boolean; gruppe: PocketGruppe }> {
  const zugang = basisUndSchluessel(env);
  if (!zugang) throw new RechteFehler("Pocket ID ist nicht eingerichtet.");
  const { basis, apiKey } = zugang;
  const personId = encodeURIComponent(eingabe.personId);

  const gruppe = gruppeAus(
    await abruf(transport, `${basis}/api/user-groups/${encodeURIComponent(eingabe.gruppeId)}`, apiKey),
  );
  if (!gruppe) throw new RechteFehler("Diese Gruppe gibt es in Pocket ID nicht.");
  if (gruppe.ldap) throw new RechteFehler("Diese Gruppe kommt aus LDAP und lässt sich hier nicht ändern.");
  if (!eingabe.mitglied && eingabe.personId === eingabe.selbstId && gruppe.name === suiteAdminGroup(env)) {
    throw new RechteFehler("Deine eigene Betriebsgruppe kannst du hier nicht abgeben.");
  }

  const roh = await abruf(transport, `${basis}/api/users/${personId}/groups`, apiKey);
  if (!Array.isArray(roh)) throw new RechteFehler("Pocket ID hat keine Gruppenliste geliefert.");
  const vorher = roh.map(gruppeAus).filter((g) => g !== null).map((g) => g.id);
  const drin = vorher.includes(gruppe.id);
  if (drin === eingabe.mitglied) return { geaendert: false, gruppe };

  const nachher = eingabe.mitglied ? [...vorher, gruppe.id] : vorher.filter((id) => id !== gruppe.id);
  await abruf(transport, `${basis}/api/users/${personId}/user-groups`, apiKey, {
    method: "PUT",
    body: { userGroupIds: nachher },
  });
  return { geaendert: true, gruppe };
}
