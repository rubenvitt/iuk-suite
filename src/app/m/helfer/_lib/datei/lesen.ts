/**
 * Das Lesen einer Helferliste aus einer Excel-Datei (IDA-281) in dieselbe Form, die HiOrg liefert
 * (`QuellPerson`). Danach laufen beide durch denselben Filter und denselben Abgleich.
 *
 * Serverseitig: `core/export/lesen.ts` entpackt mit `node:zlib`. Die Datei selbst wird nirgends
 * gespeichert; nach diesem Aufruf sind nur noch die Felder aus `spalten.ts` im Speicher.
 *
 * Die Wiedererkennung zwischen zwei Uploads (`quellId`): die Spalte „Kennung“, wenn die Zeile eine
 * trägt, sonst Nach- und Vorname. Beide Formen haben ein Präfix, damit eine Kennung nie zufällig
 * einem Namen gleicht.
 */
import { istMappe, lesEinMappe, type EingeleseneMappe } from "@/core/export/lesen";
import { datumAlsIso, HIORG_STATUS, type Qualifikation, type QuellPerson } from "../hiorg/person";
import { DATEI_SPALTEN, feldFuerKopf, normalisiereKopf, type DateiFeld } from "./spalten";

/** Obergrenze der Datei; eine Liste mit zehntausend Personen bleibt weit darunter. */
export const DATEI_HOECHSTENS_BYTES = 5 * 1024 * 1024;
/** Dieselbe Obergrenze wie für eine Antwort von HiOrg (`../hiorg/person.ts`). */
const HOECHSTENS_ZEILEN = 20_000;

export type DateiGelesen =
  | { ok: true; personen: QuellPerson[]; unlesbar: number; ignorierteSpalten: string[] }
  | { ok: false; fehler: string };

const KEINE_MAPPE = "Das ist keine Excel-Datei. Bitte eine .xlsx-Datei wählen (in Excel: Speichern unter → Excel-Arbeitsmappe).";

/** Mehrere Werte in einer Zelle: Komma, Semikolon oder Zeilenumbruch. */
function liste(zelle: string): string[] {
  return [...new Set(zelle.split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean))];
}

/** `Rettungssanitäter (RS)` → Name und Kurzform; ohne Klammer bleibt die Kurzform leer. */
function qualifikation(eintrag: string): Qualifikation {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(eintrag);
  const name = (m ? m[1] : eintrag).trim();
  const kurz = (m ? m[2] : "").trim();
  return { liste: "", name: name || kurz, kurz };
}

/** `Eingeschränkt` → `eingeschraenkt`; leer → `aktiv`. Ein unbekannter Wert bleibt und fällt im Filter durch. */
function status(zelle: string): string {
  const n = normalisiereKopf(zelle);
  if (n === "") return "aktiv";
  return (HIORG_STATUS as readonly string[]).includes(n) ? n : zelle.trim().slice(0, 40);
}

const vergleich = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

/** Eine Zeile als Person, oder `null`, wenn sie nicht lesbar ist (Pflichtfeld leer, Wert zu lang). */
function person(zeile: string[], spalte: Map<DateiFeld, number>): QuellPerson | null {
  const wert = (f: DateiFeld) => {
    const i = spalte.get(f);
    return i === undefined ? "" : (zeile[i] ?? "").trim();
  };
  const vorname = wert("vorname").replace(/\s+/g, " ");
  const nachname = wert("nachname").replace(/\s+/g, " ");
  const kennung = wert("kennung");
  if (!vorname || !nachname || vorname.length > 80 || nachname.length > 80 || kennung.length > 60) return null;
  const gruppen = liste(wert("gruppen"));
  const qualifikationen = liste(wert("qualifikationen")).map(qualifikation);
  if (gruppen.length > 200 || gruppen.some((g) => g.length > 80)) return null;
  if (qualifikationen.length > 200 || qualifikationen.some((q) => q.name.length > 120 || q.kurz.length > 40)) return null;
  const roherAustritt = wert("austritt");
  const austritt = datumAlsIso(roherAustritt);
  // Ein Austritt, der sich nicht lesen lässt, ist keine Lücke: die Person könnte ausgetreten sein.
  if (roherAustritt !== "" && austritt === null) return null;
  return {
    quellId: kennung ? `k:${kennung}` : `n:${vergleich(nachname)}|${vergleich(vorname)}`,
    vorname,
    nachname,
    status: status(wert("status")),
    gesperrt: false,
    austritt,
    gruppen,
    qualifikationen,
  };
}

/** Ordnet eine eingelesene Mappe zu; getrennt von `liesHelferMappe`, damit Tests ohne ZIP auskommen. */
export function ordneMappeZu(mappe: EingeleseneMappe): DateiGelesen {
  const spalte = new Map<DateiFeld, number>();
  const ignorierteSpalten: string[] = [];
  mappe.spalten.forEach((kopf, i) => {
    const feld = feldFuerKopf(kopf);
    if (feld === null || spalte.has(feld)) {
      if (kopf.trim()) ignorierteSpalten.push(kopf.trim());
      return;
    }
    spalte.set(feld, i);
  });
  const fehlen = DATEI_SPALTEN.filter((s) => s.pflicht && !spalte.has(s.feld)).map((s) => `„${s.kopf}“`);
  if (fehlen.length > 0) {
    return { ok: false, fehler: `In der ersten Zeile der Datei fehlt die Spalte ${fehlen.join(" und ")}. Am einfachsten startest du mit der Vorlage.` };
  }
  if (mappe.zeilen.length > HOECHSTENS_ZEILEN) {
    return { ok: false, fehler: `Die Datei hat mehr als ${HOECHSTENS_ZEILEN.toLocaleString("de-DE")} Zeilen.` };
  }
  const personen: QuellPerson[] = [];
  let unlesbar = 0;
  for (const zeile of mappe.zeilen) {
    const p = person(zeile, spalte);
    if (p) personen.push(p);
    else unlesbar++;
  }
  return { ok: true, personen, unlesbar, ignorierteSpalten };
}

/** Liest das erste Blatt einer `.xlsx`. Eine kaputte oder fremde Datei ist eine Meldung, kein Wurf. */
export function liesHelferMappe(bytes: Uint8Array): DateiGelesen {
  if (bytes.byteLength === 0) return { ok: false, fehler: "Die Datei ist leer." };
  if (bytes.byteLength > DATEI_HOECHSTENS_BYTES) return { ok: false, fehler: "Die Datei ist größer als 5 MB." };
  if (!istMappe(bytes)) return { ok: false, fehler: KEINE_MAPPE };
  let mappe: EingeleseneMappe | null;
  try {
    mappe = lesEinMappe(bytes);
  } catch {
    return { ok: false, fehler: "Die Excel-Datei lässt sich nicht lesen. Ist sie beschädigt oder mit einem Kennwort geschützt?" };
  }
  if (mappe === null) return { ok: false, fehler: "Das erste Blatt der Datei ist leer." };
  return ordneMappeZu(mappe);
}
