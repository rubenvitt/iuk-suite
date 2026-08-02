import { notFound } from "next/navigation";
import { getModule, prodHostsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * HOST-ROLLEN DES MODULS `files` — sechs Funktionen, eine Aufgabe je Funktion
 * (Entwurf §3.2).
 *
 * `files` bedient ZWEI Prod-Hosts aus EINER Variable `SUITE_HOST_FILES`, und
 * die Reihenfolge traegt die Rolle (Index 0 = Verwaltung, Index 1 = Inbox).
 * Warum eine Variable und nicht zwei: `SUITE_HOST_<KEY>` ist die eine Quelle,
 * aus der Routing (`routing.ts` ueber `moduleForHost`) und Login-Allowlist
 * (`core/auth/redirect.ts`) lesen. Eine zusaetzliche `SUITE_HOST_FILES_INBOX`
 * bricht den Boot ab, weil jedes `SUITE_HOST_*` ohne passenden Modul-Key
 * gemeldet wird (`hosts.ts:69-76`); eine Rollen-Syntax im Wert
 * (`inbox:drop.iuk-ue.de`) ebenso, weil ein `:` im Hostnamen abgewiesen wird
 * (`hosts.ts:78-86`).
 *
 * JEDER HOST BEDIENT NUR DIE PFADE SEINER ROLLE — Dauerzustand, keine
 * Uebergangsregel: ein `/u/<token>` auf dem Verwaltungs-Host und ein `/s/<id>`
 * auf dem Inbox-Host antworten 404. Beide Alt-Apps hatten je einen Host mit
 * disjunkten Pfadraeumen; ein gedruckter Code der Form `drop.…/s/<id>` kann
 * nicht existieren. Verankert ist die Sperre an drei Stellen, und die dritte
 * vergisst man: die Group-Layouts, der Rollen-Verteiler auf `/`, und JEDER
 * Route Handler unter `api/` — Handler haben kein Layout.
 *
 * DREI NAMEN, DREI EINSATZORTE, und die Trennung ist verbindlich:
 * `resolveRole` (Seiten und Verteiler, wirft bei unbekanntem Host),
 * `requireRolle` (Layouts und Seiten, wirft bei falscher Rolle),
 * `rolleOderNull` (ROUTE HANDLER, wirft nie — der Handler baut seine 404
 * selbst). Wer in einem Handler eine werfende Form benutzt, tauscht eine
 * benannte 404 gegen eine Ausnahme im Antwortweg.
 *
 * Diese Datei traegt bewusst KEIN `"use client"`: Server Components und Route
 * Handler importieren aus ihr Werte und Funktionen.
 */

export type Rolle = "verwaltung" | "inbox";

/**
 * Die Rollen in der Reihenfolge, in der sie in `SUITE_HOST_FILES` stehen.
 * Index 0 = Verwaltung ist eine bewusste Wahl: `moduleUrl` liest
 * `prodHostsFor(mod)[0]` (`core/shell/moduleUrl.ts:19-22`), der App-Switcher
 * zeigt damit auf die Verwaltungs-Domain — die Inbox-Domain ist fuer anonyme
 * Melder, nicht fuer angemeldete Betreiber.
 */
const ROLLEN_REIHENFOLGE = ["verwaltung", "inbox"] as const;

/** Wie in `registry.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Der Variablenname steht nur hier — er geht ausschliesslich in
 * Fehlermeldungen; gelesen wird die Konfiguration ueber `prodHostsFor`.
 */
const HOST_VARIABLE = "SUITE_HOST_FILES";

/**
 * Die geltenden Hosts des Moduls. IMMER ueber `prodHostsFor`, NIE ueber
 * `mod.prodHosts` direkt — sonst greift `SUITE_HOST_FILES` an dieser Stelle
 * nicht (`registry.ts:28-34` schreibt die Falle aus; genau so entstand
 * Post-Cutover-Befund 2, als der App-Switcher an der Registry vorbei baute).
 * Der Fehler ist still, weil `prodHosts: []` beide Bauformen vor dem Cutover
 * gleich aussehen laesst.
 */
function hosts(env?: EnvLike): string[] {
  const mod = getModule("files");
  return env === undefined ? prodHostsFor(mod) : prodHostsFor(mod, env);
}

/**
 * Normalisiert wie `moduleForHost` (`registry.ts:142`): Port abschneiden,
 * kleinschreiben. Die Werte aus `envHostsFor` sind bereits kleingeschrieben und
 * portlos, also treffen sich beide Seiten in derselben Form.
 */
function hostname(roh: string): string {
  return roh.split(":")[0].toLowerCase();
}

/**
 * Dieselbe Auflösung OHNE Wurf — fuer Route Handler, die eine eigene Antwort
 * bauen muessen (ein `notFound()` in einem Handler ist keine brauchbare Antwort
 * auf einen Download-Link). Unbekannter Host → null.
 *
 * `resolveHost` aus `core/routing.ts` wird WIEDERVERWENDET, nicht nachgebaut:
 * eine zweite Auflösung waere genau der Ort, an dem beide auseinanderlaufen.
 * Sie kennt die Vorrangregel `x-forwarded-host` vor `host`, die nach dem
 * Rewrite der Middleware die einzige richtige ist.
 */
export function rolleOderNull(headers: Headers): Rolle | null {
  const gesucht = hostname(resolveHost(headers));
  if (!gesucht) return null;
  const konfiguriert = hosts();
  for (const [index, rolle] of ROLLEN_REIHENFOLGE.entries()) {
    if (konfiguriert[index] !== undefined && konfiguriert[index] === gesucht) {
      return rolle;
    }
  }
  return null;
}

/**
 * Host → Rolle. Unbekannter Host → `notFound()`. Genau diese eine Aufgabe.
 *
 * Kein 403: die Existenz eines Pfades auf dem falschen Host wird nicht verraten
 * (`docs/design/README.md:239-242`).
 */
export function resolveRole(headers: Headers): Rolle {
  const rolle = rolleOderNull(headers);
  if (rolle === null) notFound();
  return rolle;
}

/**
 * Die Rollensperre fuer LAYOUTS UND SEITEN, erste Anweisung: passt die Rolle
 * nicht, `notFound()`. Wirft also — und ist deshalb NICHT die Form fuer Route
 * Handler (siehe `rolleOderNull`).
 */
export function requireRolle(rolle: Rolle, headers: Headers): void {
  if (resolveRole(headers) !== rolle) notFound();
}

/** Rolle → Host, oder `null`, wenn diese Rolle keinen Host hat (vor dem Cutover). */
export function hostFuerRolle(rolle: Rolle): string | null {
  return hosts()[ROLLEN_REIHENFOLGE.indexOf(rolle)] ?? null;
}

/**
 * Oeffentliche Adresse fuer eine ERZEUGTE Nutzlast: Host aus der ROLLE,
 * Protokoll und ggf. PORT aus dem Request.
 *
 * Der Host aus der Rolle ist der ganze Punkt: ein auf der Inbox-Domain
 * erzeugter Share-QR trueg sonst `drop.iuk-ue.de`, funktionierte sofort, saehe
 * richtig aus — und wuerde beim Abschalten eines Hosts ungueltig, auf Papier,
 * das dann laengst verteilt ist. GEDRUCKT IST GEDRUCKT.
 *
 * Das Protokoll kommt aus `x-forwarded-proto`, sonst `http`. Der Rueckfall ist
 * nicht geraten: `req.url` traegt nach dem Rewrite immer die interne
 * http-Adresse (belegt an `feedback/_ui/Teilnahme.tsx:50-53`).
 *
 * DER PORT KOMMT AUS DEM REQUEST, und ohne diese Regel ist der Dev-/E2E-Aufbau
 * kaputt: `validateHostConfig` weist jeden `SUITE_HOST_*`-Wert mit `:` ab
 * (`hosts.ts:78-86`), der Host aus der Rolle ist also immer portlos — E2E laeuft
 * aber auf 3100 und `pnpm dev` auf 3000. Ein erzeugter Link lautete sonst
 * `http://drop.localtest.me/u/<token>` und waere lokal unerreichbar. Hinter
 * Traefik traegt der Host-Header keinen Port, die Regel ist dort also folgenlos;
 * eine `NODE_ENV`-Abfrage waere ein zweiter Schalter und braucht es nicht.
 *
 * Wirft, wenn die Rolle keinen Host hat — der Aufrufer muss den Zustand vorher
 * ueber `hostFuerRolle` abfragen und einen benannten Zustand zeigen (§10). Das
 * ist bewusst KEINE 404: hier liegt ein Konfigurationsfehler vor, keine Anfrage
 * auf dem falschen Host.
 */
export function oeffentlicheUrl(rolle: Rolle, pfad: string, headers: Headers): string {
  const host = hostFuerRolle(rolle);
  if (host === null) {
    throw new Error(
      `Die Rolle "${rolle}" hat keinen Host — ${HOST_VARIABLE} ist nicht (vollstaendig) gesetzt. ` +
        `Vor dem Cutover muss der Aufrufer diesen Zustand ueber hostFuerRolle() abfragen.`,
    );
  }
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const port = resolveHost(headers).split(":")[1];
  return `${proto}://${host}${port ? `:${port}` : ""}${pfad}`;
}

/**
 * Boot-Pruefung, spaeter eingehaengt in dieselbe Fehlerliste wie
 * `validateHostConfig`/`validateGroupConfig`. Liefert Fehlermeldungen; leer
 * heisst „in Ordnung".
 *
 * | Zahl der Hosts | Urteil |
 * |---|---|
 * | 0 | erlaubt — „kein Cutover" bzw. „Cutover zurueckgenommen" ist eine Aussage, und das Modul muss vor dem ersten Cutover bootfaehig sein |
 * | 1 | Abbruch — eine Rolle haette keinen Host, und ein QR mit `null` im Host ist Altpapier |
 * | 2 verschieden | erlaubt |
 * | 2 gleich | Abbruch — `validateHostConfig` sieht das NICHT: `claimedBy` meldet nur, wenn `other !== key` (`hosts.ts:87-94`), eine Doppelung INNERHALB eines Moduls faellt durch und beide Rollen zeigten still auf denselben Host |
 * | ≥ 3 | Abbruch — es gibt nur zwei Rollen |
 *
 * Die Meldung fuer genau einen Host nennt NICHT, welche Rolle fehlt: das kann
 * der Code nicht wissen. Sie ist deshalb fuer beide Einzelhosts dieselbe.
 */
export function validateFilesHosts(env?: EnvLike): string[] {
  const konfiguriert = hosts(env);
  const anzahl = konfiguriert.length;

  if (anzahl === 0) return [];

  if (anzahl === 1) {
    return [
      `${HOST_VARIABLE}: genau ein Host gesetzt. Das Modul files hat zwei Rollen ` +
        `(Index 0 = ${ROLLEN_REIHENFOLGE[0]}, Index 1 = ${ROLLEN_REIHENFOLGE[1]}); ` +
        `setze beide Hosts in dieser Reihenfolge oder leere die Variable.`,
    ];
  }

  if (anzahl > ROLLEN_REIHENFOLGE.length) {
    return [
      `${HOST_VARIABLE}: ${anzahl} Hosts gesetzt, es gibt aber nur zwei Rollen ` +
        `(${ROLLEN_REIHENFOLGE.join(", ")}).`,
    ];
  }

  if (konfiguriert[0] === konfiguriert[1]) {
    return [
      `${HOST_VARIABLE}: beide Rollen zeigen auf denselben Host "${konfiguriert[0]}". ` +
        `${ROLLEN_REIHENFOLGE[0]} und ${ROLLEN_REIHENFOLGE[1]} brauchen verschiedene Hosts.`,
    ];
  }

  return [];
}
