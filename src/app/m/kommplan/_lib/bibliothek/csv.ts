import { leseEinheitenliste } from "../plan/einfuegen";
import { LAENGE } from "../plan/schema";
import { BIB_GRENZE } from "./schema";

/**
 * EINHEITEN IMPORTIEREN (Umsetzungsplan Phase 4, Entscheidung 12) — rein. Zwei Quellen, eine Form:
 * eine CSV `Typ;Rufname[;Notiz]` und der Text aus „Liste einfügen" (derselbe Parser wie im Flyin,
 * `leseEinheitenliste`). Fehler tragen die Zeilennummer der Quelle; NICHTS wird still gekürzt — eine
 * Liste mit Fehlern übernimmt die Oberfläche gar nicht.
 */
export interface ImportZeile { zeile: number; typ: string; rufname: string; notiz: string | null }
export interface ImportLesung { zeilen: ImportZeile[]; fehler: string[] }

/** UTF-8, sonst Windows-1252 — Excel speichert „CSV (Trennzeichen-getrennt)" auf deutschen Systemen so. Die BOM fällt weg. */
export function dekodiereText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

/** RFC-4180-artig: Felder in "…", `""` ist ein Anführungszeichen, Umbrüche in Anführungszeichen gehören zum Feld. */
export function leseCsv(text: string, trenner = ";"): { saetze: { zeile: number; felder: string[] }[]; fehler: string | null } {
  const t = text.replace(/^﻿/, "");
  const saetze: { zeile: number; felder: string[] }[] = [];
  let felder: string[] = [];
  let feld = "";
  let inAnf = false;
  let zeile = 1;
  let start = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inAnf) {
      if (c === '"') {
        if (t[i + 1] === '"') { feld += '"'; i++; } else inAnf = false;
      } else {
        if (c === "\n" || (c === "\r" && t[i + 1] !== "\n")) zeile++;
        feld += c;
      }
      continue;
    }
    if (c === '"' && feld === "") { inAnf = true; continue; }
    if (c === trenner) { felder.push(feld); feld = ""; continue; }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      felder.push(feld);
      saetze.push({ zeile: start, felder });
      felder = []; feld = ""; zeile++; start = zeile;
      continue;
    }
    feld += c;
  }
  if (inAnf) return { saetze, fehler: `Zeile ${start}: Ein Anführungszeichen wird nicht geschlossen.` };
  if (feld !== "" || felder.length > 0) { felder.push(feld); saetze.push({ zeile: start, felder }); }
  return { saetze, fehler: null };
}

function pruefe(zeile: number, typ: string, rufname: string, notiz: string, aus: ImportLesung): void {
  if (rufname === "") { aus.fehler.push(`Zeile ${zeile}: Der Rufname fehlt (Trennzeichen ist das Semikolon).`); return; }
  if (typ === "") { aus.fehler.push(`Zeile ${zeile}: Der Typ fehlt.`); return; }
  if (typ.length > LAENGE.typ) { aus.fehler.push(`Zeile ${zeile}: Der Typ ist länger als ${LAENGE.typ} Zeichen.`); return; }
  if (rufname.length > LAENGE.rufname) { aus.fehler.push(`Zeile ${zeile}: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`); return; }
  if (notiz.length > BIB_GRENZE.notiz) { aus.fehler.push(`Zeile ${zeile}: Die Notiz ist länger als ${BIB_GRENZE.notiz} Zeichen.`); return; }
  aus.zeilen.push({ zeile, typ, rufname, notiz: notiz === "" ? null : notiz });
}

function deckel(aus: ImportLesung): ImportLesung {
  if (aus.zeilen.length > BIB_GRENZE.import) aus.fehler.push(`Höchstens ${BIB_GRENZE.import} Zeilen je Import — hier sind es ${aus.zeilen.length}.`);
  return aus;
}

export function leseEinheitenCsv(text: string): ImportLesung {
  const { saetze, fehler } = leseCsv(text);
  const aus: ImportLesung = { zeilen: [], fehler: fehler ? [fehler] : [] };
  let erste = true;
  for (const { zeile, felder } of saetze) {
    const zellen = felder.map((f) => f.trim());
    while (zellen.length > 3 && zellen[zellen.length - 1] === "") zellen.pop(); // Excel hängt leere Spalten an
    if (zellen.every((z) => z === "")) continue;
    if (erste) {
      erste = false;
      if (zellen[0]?.toLowerCase() === "typ" && zellen[1]?.toLowerCase() === "rufname") continue;
    }
    if (zellen.length > 3) { aus.fehler.push(`Zeile ${zeile}: Mehr als drei Spalten — erwartet wird Typ;Rufname;Notiz.`); continue; }
    pruefe(zeile, zellen[0] ?? "", zellen[1] ?? "", zellen[2] ?? "", aus);
  }
  return deckel(aus);
}

/** „Liste einfügen": Zeile für Zeile durch `leseEinheitenliste`, damit die Zeilennummern stimmen. */
export function einheitenAusListe(text: string): ImportLesung {
  const aus: ImportLesung = { zeilen: [], fehler: [] };
  text.split(/\r\n|\r|\n/).forEach((roh, i) => {
    const r = leseEinheitenliste(roh);
    aus.fehler.push(...r.fehler.map((f) => f.replace(/^Zeile 1:/, `Zeile ${i + 1}:`)));
    for (const e of r.einheiten) {
      if (e.rufname === "") aus.fehler.push(`Zeile ${i + 1}: Der Rufname fehlt.`);
      else aus.zeilen.push({ zeile: i + 1, typ: e.typ, rufname: e.rufname, notiz: null });
    }
  });
  return deckel(aus);
}
