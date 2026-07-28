import type { DirectoryPerson } from "@/core/directory";

/**
 * DIE VEREINIGUNG DER ZWEI PERSONENQUELLEN — rein, ohne Datenbank und ohne Netz.
 *
 * Das Modul kennt Personen aus zwei Richtungen, und beide sind unvollstaendig:
 *
 * - `core/directory` (Pocket ID) kennt JEDEN — auch, wer sich nie angemeldet hat.
 *   Genau das war die Luecke: bisher war eine Person erst zuordenbar, NACHDEM sie
 *   `/m/feedback` einmal geoeffnet hatte (`upsertKnownUser` in
 *   `requireFeedbackAccess.ts`, hinter dem Auth-Riegel).
 * - `known_users` kennt nur, wer da war — dafuer auch dann noch, wenn die API
 *   ausfaellt oder gar nicht konfiguriert ist. Es ist der Rueckfall, nicht der
 *   Hauptweg.
 *
 * Diese Datei liegt beim MODUL und nicht in `core`: die Vereinigung greift auf
 * `known_users` zu, und das ist eine Tabelle des Moduls `feedback`. `core` darf
 * Modul-Interna nicht kennen (`docs/design/README.md`: „Modul-Interna sind kein
 * API"), also gehoert genau diese Naht hierher.
 *
 * Der gespeicherte Schluessel bleibt in jedem Fall der OIDC-`sub`. Name und
 * E-Mail sind Anzeigetext; sie werden nie geschrieben.
 */

/** Eine Zeile aus `known_users` — so, wie `listKnownUsers` sie liefert. */
export type BekanntePerson = { userId: string; name: string | null; email: string | null };

export type PersonVorschlag = {
  /** Der OIDC-`sub`. Das — und nur das — wird gespeichert. */
  userId: string;
  name: string | null;
  email: string | null;
  /**
   * Steht die Person in `known_users`? `false` ist KEIN Fehler, sondern der
   * Normalfall, den das Verzeichnis erst zuordenbar macht.
   *
   * ENGER ALS DER NAME VERSPRICHT: `known_users` fuellt `requireFeedbackAccess`
   * NACH seinem `notFound()`. Eingetragen ist also, wer die Verwaltung DIESES
   * Moduls mit Zugang geoeffnet hat — nicht, wer sich an der Suite angemeldet
   * hat. Wer taeglich eingeloggt ist, aber in keiner Feedback-Gruppe steht, ist
   * hier `false`. Die Oberflaeche sagt deshalb „noch nie in der Verwaltung".
   */
  angemeldet: boolean;
};

/**
 * Wie viele Treffer eine Suche hoechstens ueber die RSC-Grenze schickt.
 *
 * DATENSPARSAMKEIT: Der vollstaendige Abzug bleibt im Server-Prozess. Nichts
 * serialisiert die Nutzerliste in eine Client-Nutzlast — weder die Cockpit-Seite
 * (sie schickt nur die Mitglieder DIESER Gruppe) noch die Suche (sie schickt
 * hoechstens diese Zahl pro Anschlag, und nur an einen Admin). 20 ist die Zahl,
 * die in eine Auswahlliste passt; wer mehr Treffer hat, hat zu kurz getippt.
 */
export const SUCHE_MAX_TREFFER = 20;

/**
 * Ab wann ueberhaupt gesucht wird. Unter zwei Zeichen ist jede Antwort eine
 * halbe Mitgliederliste, und der Nutzen ist null.
 */
export const SUCHE_MIN_ZEICHEN = 2;

/**
 * Die Feldmeldung, wenn eine E-Mail nirgends auffindbar ist, OBWOHL das
 * Verzeichnis erreichbar war. Dann ist „muss sich einmal anmelden" die falsche
 * Auskunft — das Konto existiert schlicht nicht mit dieser Adresse.
 */
export const FEHLER_EMAIL_UNBEKANNT =
  "Diese E-Mail ist unbekannt — bitte die Schreibweise prüfen oder den Namen eintippen.";

/**
 * Dieselbe Lage OHNE Verzeichnis (nicht konfiguriert oder nicht erreichbar):
 * dann stimmt der alte Satz weiterhin, denn dann ist `known_users` die einzige
 * Quelle und die fuellt sich nur durch Anmelden.
 */
export const FEHLER_EMAIL_UNBEKANNT_OHNE_VERZEICHNIS =
  "Diese E-Mail ist unbekannt — die Person muss die Verwaltung einmal geöffnet haben.";

function suchfeld(p: { userId: string; name: string | null; email: string | null }): string {
  return `${p.name ?? ""} ${p.email ?? ""} ${p.userId}`.toLowerCase();
}

/**
 * Trifft eine lokal bekannte Person den Suchbegriff? Dieselben drei Felder wie
 * im Verzeichnis, damit ein Begriff nicht je nach Quelle anders trifft.
 */
export function passtAufSuche(p: BekanntePerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return false;
  return suchfeld(p).includes(q);
}

/**
 * Reihenfolge der Vorschlaege: wer VORNE passt zuerst, dann der Rest, innerhalb
 * beider Gruppen ohne Namen ans Ende und sonst alphabetisch.
 *
 * DER SUCHBEGRIFF GEHOERT HIER HEREIN, weil sonst zweimal hintereinander mit
 * VERSCHIEDENEN Massstaeben sortiert und geschnitten wird: `core/directory`
 * liefert seine 20 besten Treffer nach Relevanz, und ein rein alphabetisches
 * Nachsortieren wuerde beim zweiten Schnitt genau die vordersten davon
 * wegwerfen — bei „ann" verdraengte ein „Ahrens" die gesuchte „Anna".
 */
function nachRelevanz(a: PersonVorschlag, b: PersonVorschlag, q: string): number {
  if (q !== "") {
    const rang = (p: PersonVorschlag) =>
      (p.name ?? "").toLowerCase().startsWith(q) || (p.email ?? "").toLowerCase().startsWith(q)
        ? 0
        : 1;
    const d = rang(a) - rang(b);
    if (d !== 0) return d;
  }
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  return (a.name ?? a.userId).localeCompare(b.name ?? b.userId, "de");
}

/**
 * Verzeichnis + `known_users` zu einer entdoppelten Liste.
 *
 * Bei Name und E-Mail gewinnt das VERZEICHNIS: `known_users` haelt den Stand der
 * letzten Anmeldung fest und veraltet mit jeder Namensaenderung. Wo das
 * Verzeichnis nichts weiss, fuellt `known_users` die Luecke.
 */
export function vereinigePersonen(
  ausVerzeichnis: DirectoryPerson[],
  ausBekannten: BekanntePerson[],
  limit: number = SUCHE_MAX_TREFFER,
  /** Der Suchbegriff, der die Trefferlisten erzeugt hat — siehe `nachRelevanz`. */
  query = "",
): PersonVorschlag[] {
  const q = query.trim().toLowerCase();
  const bekannt = new Map(ausBekannten.map((p) => [p.userId, p]));
  const zusammen = new Map<string, PersonVorschlag>();

  for (const p of ausVerzeichnis) {
    const lokal = bekannt.get(p.userId);
    zusammen.set(p.userId, {
      userId: p.userId,
      name: p.name ?? lokal?.name ?? null,
      email: p.email ?? lokal?.email ?? null,
      angemeldet: lokal !== undefined,
    });
  }
  for (const p of ausBekannten) {
    if (zusammen.has(p.userId)) continue;
    zusammen.set(p.userId, { ...p, angemeldet: true });
  }

  return [...zusammen.values()]
    .sort((a, b) => nachRelevanz(a, b, q))
    .slice(0, Math.max(0, limit));
}

/**
 * Die zugeordnete Leitung einer Gruppe, angereichert um Namen aus beiden
 * Quellen.
 *
 * DIE MITGLIEDSLISTE FUEHRT, NICHT DAS VERZEICHNIS. Wer in `user_groups` steht,
 * erscheint hier — auch wenn beide Verzeichnisse ihn nicht kennen (API weg,
 * Konto geloescht, Import mit fremden Ids). Sonst waere ein Verzeichnisausfall
 * gleichbedeutend mit „die Gruppe hat keine Leitung", und der Admin wuerde
 * Zuordnungen neu setzen, die es laengst gibt.
 */
export function leitungAus(
  mitgliedIds: string[],
  ausVerzeichnis: DirectoryPerson[],
  ausBekannten: BekanntePerson[],
): PersonVorschlag[] {
  const verzeichnis = new Map(ausVerzeichnis.map((p) => [p.userId, p]));
  const bekannt = new Map(ausBekannten.map((p) => [p.userId, p]));
  return [...new Set(mitgliedIds)].map((userId) => {
    const v = verzeichnis.get(userId);
    const l = bekannt.get(userId);
    return {
      userId,
      name: v?.name ?? l?.name ?? null,
      email: v?.email ?? l?.email ?? null,
      angemeldet: l !== undefined,
    };
  });
}

export type VorschlagOption = {
  /** Was im Eingabefeld steht, wenn die Person gewaehlt wurde — lesbar. */
  wert: string;
  /** Was gespeichert wird. */
  userId: string;
  person: PersonVorschlag;
};

function anzeige(p: PersonVorschlag): string {
  const name = p.name ?? null;
  if (name && p.email) return `${name} · ${p.email}`;
  return name ?? p.email ?? p.userId;
}

/**
 * Auswahlwerte fuer die Combobox.
 *
 * Der Wert ist LESBAR und nicht der `sub`: eine UUID im Eingabefeld ist nicht
 * pruefbar, und die Person soll sehen, wen sie gerade gewaehlt hat. Die
 * Zuordnung Wert → `sub` haelt die Komponente; gespeichert wird immer `userId`.
 *
 * Kollidieren zwei Anzeigen, wird die Kennung an BEIDE angehaengt. Nur an die
 * zweite waere die schlimmere Variante: dann sieht der erste Eintrag wie „der
 * richtige" aus und der zweite wie ein technischer Doppelgaenger.
 */
export function vorschlagOptionen(vorschlaege: PersonVorschlag[]): VorschlagOption[] {
  const anzahl = new Map<string, number>();
  for (const p of vorschlaege) {
    const a = anzeige(p);
    anzahl.set(a, (anzahl.get(a) ?? 0) + 1);
  }
  return vorschlaege.map((person) => {
    const a = anzeige(person);
    const doppelt = (anzahl.get(a) ?? 0) > 1;
    return {
      wert: doppelt ? `${a} · ${person.userId}` : a,
      userId: person.userId,
      person,
    };
  });
}
