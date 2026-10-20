/**
 * Das Lesen einer Personalantwort von HiOrg-Server (`GET /core/v1/personal`, JSON:API,
 * `application/vnd.api+json`; Doku https://api.hiorg-server.de/docs).
 *
 * DIE ALLOWLIST IST DER DATENSCHUTZ. HiOrg liefert je Person rund fünfzig Felder, darunter
 * Bankverbindung, Geburtsdatum, Anschrift, Telefon, Allergien, Ernährung, Führerscheinnummer,
 * Angehörige und freie Bemerkungen — eine Feldauswahl (`fields[user]`) ist nicht dokumentiert.
 * `zod` verwirft unbekannte Schlüssel (`z.object` ist „strip“), das Schema unten nennt also
 * abschließend, was das Modul überhaupt zu sehen bekommt. Alles andere ist nach `lesePersonal`
 * nicht mehr im Speicher, nie in der Datenbank und nie im Protokoll. `person.test.ts` hält das mit
 * der vollständigen Beispielperson aus der HiOrg-Spezifikation fest.
 *
 * Gelesen werden zusätzlich `gesperrt` und `austritt_datum`: nur für den Filter (`../filter.ts`),
 * gespeichert werden sie nicht.
 *
 * Kein `"use client"`, keine Node-API: dieselbe Funktion liest die echte Antwort und die
 * Demo-Antwort (`../demo/antwort.ts`), damit der Demo-Modus genau den Weg zeigt, den ein echter
 * Import nimmt.
 */
import { z } from "zod";

/** Kontostatus laut Spezifikation; ein neuer Wert von HiOrg bleibt lesbar und fällt im Filter durch. */
export const HIORG_STATUS = ["aktiv", "eingeschraenkt", "extern", "gesperrt"] as const;

export interface Qualifikation {
  /** Name der Qualifikationsliste in HiOrg, z. B. „med. Qualifikation“. */
  liste: string;
  name: string;
  kurz: string;
}

/** Was von einer HiOrg-Person übrig bleibt. */
export interface QuellPerson {
  quellId: string;
  vorname: string;
  nachname: string;
  status: string;
  gesperrt: boolean;
  /** `YYYY-MM-DD` oder `null`. HiOrg schreibt das Datum mal als `01.01.2000`, mal als `2000-01-01`. */
  austritt: string | null;
  gruppen: string[];
  qualifikationen: Qualifikation[];
}

const text = (max: number) => z.string().trim().max(max);

const qualifikationSchema = z.object({
  liste: text(120).catch(""),
  name: text(120),
  name_kurz: text(40).catch(""),
});

const personSchema = z.object({
  type: z.literal("user"),
  id: z.string().trim().min(1).max(64),
  attributes: z.object({
    vorname: text(80).min(1),
    nachname: text(80).min(1),
    status: text(40).catch(""),
    gesperrt: z.boolean().catch(false),
    austritt_datum: z.string().nullish().catch(null),
    gruppen_namen: z.array(text(80)).max(200).catch([]),
    qualifikationen: z.array(qualifikationSchema.nullable().catch(null)).max(200).catch([]),
  }),
});

const antwortSchema = z.object({
  data: z.array(z.unknown()).max(20_000),
  links: z.object({ next: z.string().url().nullish() }).nullish().catch(null),
});

/** `01.01.2000`, `2000-01-01` oder `2000-01-01T…` → `2000-01-01`; leer oder unlesbar → `null`. */
export function datumAlsIso(roh: string | null | undefined): string | null {
  const s = roh?.trim();
  if (!s) return null;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export type Personalseite =
  | { ok: true; personen: QuellPerson[]; unlesbar: number; weiter: string | null }
  | { ok: false; fehler: string };

/**
 * Liest eine Seite der Personalantwort. Einzelne unlesbare Einträge zählen als `unlesbar` und
 * brechen den Abgleich nicht ab; eine Antwort ohne `data`-Liste ist ein Fehler.
 * `weiter` ist `links.next`, falls HiOrg seitenweise ausliefert (nicht dokumentiert, aber JSON:API).
 */
export function lesePersonal(json: unknown): Personalseite {
  const antwort = antwortSchema.safeParse(json);
  if (!antwort.success) return { ok: false, fehler: "HiOrg-Server hat keine lesbare Personalliste geliefert." };
  const personen: QuellPerson[] = [];
  let unlesbar = 0;
  for (const eintrag of antwort.data.data) {
    const p = personSchema.safeParse(eintrag);
    if (!p.success) {
      unlesbar++;
      continue;
    }
    const a = p.data.attributes;
    personen.push({
      quellId: p.data.id,
      vorname: a.vorname,
      nachname: a.nachname,
      status: a.status,
      gesperrt: a.gesperrt,
      austritt: datumAlsIso(a.austritt_datum),
      gruppen: [...new Set(a.gruppen_namen.filter(Boolean))],
      qualifikationen: a.qualifikationen
        .filter((q): q is z.infer<typeof qualifikationSchema> => q !== null && q.name !== "")
        .map((q) => ({ liste: q.liste, name: q.name, kurz: q.name_kurz })),
    });
  }
  return { ok: true, personen, unlesbar, weiter: antwort.data.links?.next ?? null };
}
