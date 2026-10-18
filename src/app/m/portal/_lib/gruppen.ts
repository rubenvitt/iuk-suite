import { MODULES, requiredGroupsFor } from "@/core/registry";
import { adminGroupsFor, suiteAdminGroup } from "@/core/groups";

/**
 * WER EINE NICHT ÖFFENTLICHE KACHEL SIEHT — die Gruppenwahl der Portal-Verwaltung.
 *
 * `services.requiredGroups` gibt es seit dem ersten Schema, und `canViewService`
 * (`_lib/rbac.ts`) wertet es aus. Gesetzt hat es bis IDA-227 nur der Seed: ein
 * in der Verwaltung angelegter, nicht öffentlicher Dienst war für NIEMANDEN
 * sichtbar, ohne dass es irgendwo stand.
 *
 * KEIN `"use client"`: die Seite (Server Component) ruft `ladeWaehlbareGruppen`,
 * die Actions `sichtbarkeitAusFormular` (Falle 6, `CLAUDE.md`).
 */

type EnvLike = Record<string, string | undefined>;

/** Eine Zeile der Auswahl: `wert` steht im `groups`-Claim, `anzeige` liest der Mensch. */
export type GruppenOption = { wert: string; anzeige: string };

export type GruppenQuelle = "ok" | "unconfigured" | "error";

export const OHNE_GRUPPE_FEHLER =
  "Ein nicht öffentlicher Dienst braucht mindestens eine Gruppe — sonst sieht ihn niemand.";

/** Getrimmt, ohne Leere, ohne Doppelte; Reihenfolge der Eingabe. */
function bereinigt(werte: readonly unknown[]): string[] {
  const gesehen = new Set<string>();
  for (const roh of werte) {
    const wert = typeof roh === "string" ? roh.trim() : "";
    if (wert !== "") gesehen.add(wert);
  }
  return [...gesehen];
}

/**
 * Sichtbarkeit aus dem Formular. Die Gruppen kommen als wiederholtes Feld
 * `requiredGroups` (ein verstecktes `<input>` je gewählter Gruppe), weil antds
 * `Select` kein natives Formularelement ist.
 *
 * Öffentlich speichert KEINE Gruppen: `canViewService` liest sie dann nie, und
 * eine stehengebliebene Liste behauptete in der Tabelle eine Einschränkung, die
 * nicht gilt. Nicht öffentlich ohne Gruppe wird abgelehnt — das Formular lässt es
 * gar nicht erst abschicken, hier steht die Grenze für jeden anderen Weg.
 */
export function sichtbarkeitAusFormular(formData: FormData): {
  isPublic: boolean;
  requiredGroups: string[];
} {
  const isPublic = formData.get("isPublic") === "on";
  if (isPublic) return { isPublic, requiredGroups: [] };
  const requiredGroups = bereinigt(formData.getAll("requiredGroups"));
  if (requiredGroups.length === 0) throw new Error(OHNE_GRUPPE_FEHLER);
  return { isPublic, requiredGroups };
}

/** Die Gruppen, die die Suite selbst schon benennt: Suite-Admin, Modul-Admin, Modulzugang. */
export function suiteGruppen(env: EnvLike = process.env): string[] {
  return bereinigt([
    suiteAdminGroup(env),
    ...MODULES.flatMap((mod) => [...adminGroupsFor(mod, env), ...requiredGroupsFor(mod, env)]),
  ]);
}

export type PocketIdTransport = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SEITENGROESSE = 100;
const MAX_SEITEN = 20;
const TIMEOUT_MS = 5_000;

function gruppeAus(roh: unknown): GruppenOption | null {
  if (typeof roh !== "object" || roh === null) return null;
  const g = roh as Record<string, unknown>;
  // `name`, nicht `friendlyName`: Pocket ID schreibt `group.Name` in den
  // `groups`-Claim (`backend/internal/oidc/claims_service.go`, `GetUserClaims`).
  const wert = typeof g.name === "string" ? g.name.trim() : "";
  if (wert === "") return null;
  const anzeige = typeof g.friendlyName === "string" ? g.friendlyName.trim() : "";
  return { wert, anzeige: anzeige || wert };
}

/**
 * Die Gruppen aus Pocket ID (`GET /api/user-groups`), mit demselben Key und
 * derselben Basis wie das Personenverzeichnis (`getDirectory` in
 * `core/directory`). Wirft nie: ein Ausfall kostet nur die Vorschläge, eintippen
 * geht weiter. Ohne Zwischenspeicher — gelesen wird nur beim Öffnen der
 * Verwaltung, und eine eben in Pocket ID angelegte Gruppe soll sofort da sein.
 */
export async function pocketIdGruppen(
  env: EnvLike = process.env,
  transport: PocketIdTransport = (url, init) => fetch(url, init),
): Promise<{ status: GruppenQuelle; gruppen: GruppenOption[] }> {
  const basis = (env.POCKET_ID_API_URL ?? env.POCKET_ID_ISSUER ?? "").trim().replace(/\/+$/, "");
  const apiKey = (env.POCKET_ID_API_KEY ?? "").trim();
  if (basis === "" || apiKey === "") return { status: "unconfigured", gruppen: [] };

  try {
    const gruppen: GruppenOption[] = [];
    let seiten = 1;
    for (let seite = 1; seite <= Math.min(seiten, MAX_SEITEN); seite += 1) {
      const params = new URLSearchParams({
        "pagination[page]": String(seite),
        "pagination[limit]": String(SEITENGROESSE),
        "sort[column]": "name",
        "sort[direction]": "asc",
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await transport(`${basis}/api/user-groups?${params}`, {
          headers: { "X-API-KEY": apiKey, Accept: "application/json" },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Pocket ID: HTTP ${res.status}`);
        const daten = (await res.json()) as { data?: unknown; pagination?: { totalPages?: unknown } };
        if (Array.isArray(daten.data)) {
          gruppen.push(...daten.data.map(gruppeAus).filter((g): g is GruppenOption => g !== null));
        }
        const gesamt = daten.pagination?.totalPages;
        if (typeof gesamt === "number" && Number.isFinite(gesamt)) seiten = Math.max(1, gesamt);
      } finally {
        clearTimeout(timer);
      }
    }
    return { status: "ok", gruppen };
  } catch (fehler) {
    console.error("[portal][gruppen] Gruppen aus Pocket ID nicht ladbar:", fehler);
    return { status: "error", gruppen: [] };
  }
}

/**
 * Pocket ID zuerst, weil nur dort ein Anzeigename steht; danach, was die Suite
 * und die übrigen Dienste schon benennen — damit eine Gruppe auch ohne
 * Verzeichnis wählbar bleibt und eine bereits vergebene nie aus der Liste fällt.
 */
export function waehlbareGruppen(quellen: {
  pocketId: readonly GruppenOption[];
  suite: readonly string[];
  vergeben: readonly string[];
}): GruppenOption[] {
  const nachWert = new Map<string, GruppenOption>();
  for (const g of quellen.pocketId) if (!nachWert.has(g.wert)) nachWert.set(g.wert, g);
  for (const wert of bereinigt([...quellen.suite, ...quellen.vergeben])) {
    if (!nachWert.has(wert)) nachWert.set(wert, { wert, anzeige: wert });
  }
  return [...nachWert.values()].sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de"));
}

export async function ladeWaehlbareGruppen(
  dienste: readonly { requiredGroups: readonly string[] }[],
): Promise<{ quelle: GruppenQuelle; optionen: GruppenOption[] }> {
  const pocketId = await pocketIdGruppen();
  return {
    quelle: pocketId.status,
    optionen: waehlbareGruppen({
      pocketId: pocketId.gruppen,
      suite: suiteGruppen(),
      vergeben: dienste.flatMap((d) => d.requiredGroups),
    }),
  };
}
