/**
 * Reine Formularlogik der Erfassung (Spec §4.3) — keine React-Abhängigkeit, kein `invoke`.
 * Texte sind wörtlich aus der Vorlage übernommen (`docs/design/einsatzbuch-v2/vorlage/
 * Einsatzbuch v2.dc.html`, `renderVals()`), damit sich Verhalten und Wortlaut nicht heimlich
 * auseinanderentwickeln.
 */
import { dauerMinuten, dauerText, datumText } from "@kern/zeit";

import type { Entwurf, Fahrzeug, PersonAuswahl, Person, Stammdatenpaket } from "../typen";

type FehlendeAngabe = "Alarmstichwort" | "Beginn" | "Einsatzort";

/** Beginn = heute/jetzt in `zeitzone` (Vorlage: `leer()`). Alle übrigen Felder sind leer/0. */
export function leererEntwurf(jetzt: Date, zeitzone: string): Entwurf {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(jetzt);
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  return {
    stichwort: "",
    beginnDatum: `${t.year}-${t.month}-${t.day}`,
    beginnZeit: `${t.hour}:${t.minute}`,
    endeDatum: "",
    endeZeit: "",
    strasse: "",
    ort: "",
    objekt: "",
    fahrzeuge: [],
    personal: [],
    vorOrt: 0,
    transport: 0,
    notizen: "",
  };
}

/** Pflichtfelder, in der Reihenfolge der Vorlage: Alarmstichwort, Beginn, Einsatzort (Straße ODER Ort). */
export function fehlendeAngaben(e: Entwurf): FehlendeAngabe[] {
  const fehlt: FehlendeAngabe[] = [];
  if (!e.stichwort) fehlt.push("Alarmstichwort");
  if (!e.beginnDatum || !e.beginnZeit) fehlt.push("Beginn");
  if (!e.strasse && !e.ort) fehlt.push("Einsatzort");
  return fehlt;
}

/** Reiht eine Liste deutscher Begriffe mit Komma, das letzte Komma wird „und“ (Vorlage-Regex). */
function reihe(begriffe: string[]): string {
  return begriffe.join(", ").replace(/, ([^,]*)$/, " und $1");
}

/** Text unter dem Formular: entweder die fehlenden Angaben, oder eine Zeile Zusammenfassung. */
export function bereitText(e: Entwurf): string {
  const fehlt = fehlendeAngaben(e);
  if (fehlt.length > 0) return `Ohne ${reihe(fehlt)} wird nicht abgesendet.`;
  const patienten = e.vorOrt + e.transport;
  return `Bereit · ${e.stichwort}, ${e.fahrzeuge.length} Fahrzeuge, ${e.personal.length} Kräfte, ${patienten} Patienten`;
}

/** Dauer-Hinweis unter „Zeit und Einsatzort“ — offenes Ende, negative Dauer oder die Dauer selbst. */
export function dauerHinweis(e: Entwurf, zeitzone: string): string {
  const minuten = dauerMinuten(e, zeitzone);
  if (minuten === null) return "Ende noch offen — kannst du auch später in der Frist nachtragen.";
  if (minuten < 0) return "Ende liegt vor dem Beginn — bitte prüfen.";
  return `Einsatzdauer ${dauerText(minuten)}`;
}

/** „Nach dem Absenden 15 Minuten änderbar, danach nicht mehr einsehbar“ (1 → „1 Minute“). */
export function fristSatz(minuten: number): string {
  const text = minuten === 1 ? "1 Minute" : `${minuten} Minuten`;
  return `Nach dem Absenden ${text} änderbar, danach nicht mehr einsehbar`;
}

/** Fahrzeugsuche über Typ und Funkrufname (Vorlage: `${f.typ} ${f.ruf}`), gefiltert nach Standort. */
export function fahrzeugTreffer(alle: Fahrzeug[], suche: string, filter: string): Fahrzeug[] {
  const q = suche.trim().toLowerCase();
  return alle.filter((f) => (filter === "Alle" || f.standort === filter) && (!q || `${f.typ} ${f.ruf}`.toLowerCase().includes(q)));
}

/** Personensuche über Name, Qualifikation und Ortsverein, gefiltert nach Qualifikation. */
export function personTreffer(alle: Person[], suche: string, filter: string): Person[] {
  const q = suche.trim().toLowerCase();
  return alle.filter((p) => (filter === "Alle" || p.quali === filter) && (!q || `${p.name} ${p.quali} ${p.ov}`.toLowerCase().includes(q)));
}

/** Distinkte Standorte in Reihenfolge des ersten Auftretens, mit vorangestelltem „Alle“. */
export function fahrzeugFilter(alle: Fahrzeug[]): string[] {
  const gesehen = new Set<string>();
  const orte: string[] = [];
  for (const f of alle) {
    if (!gesehen.has(f.standort)) {
      gesehen.add(f.standort);
      orte.push(f.standort);
    }
  }
  return ["Alle", ...orte];
}

/** Distinkte Qualifikationen in Reihenfolge des ersten Auftretens, mit vorangestelltem „Alle“. */
export function personFilter(alle: Person[]): string[] {
  const gesehen = new Set<string>();
  const qualis: string[] = [];
  for (const p of alle) {
    if (!gesehen.has(p.quali)) {
      gesehen.add(p.quali);
      qualis.push(p.quali);
    }
  }
  return ["Alle", ...qualis];
}

/**
 * Enter in einem Suchfeld wählt den ersten Treffer (Vorlage: `fzEnter`/`peEnter`) — nie ab: Ist er
 * schon gewählt, bleibt die Liste unverändert. `null` ohne Treffer, damit der Aufrufer weiß, dass
 * nichts zu tun ist (z. B. das Suchfeld nicht leeren muss).
 */
export function waehleErstenTreffer<T extends { id: string }>(treffer: T[], gewaehlt: string[]): string[] | null {
  const erster = treffer[0];
  if (!erster) return null;
  if (gewaehlt.includes(erster.id)) return gewaehlt;
  return [...gewaehlt, erster.id];
}

/** Fahrzeug an-/abwählen. Abwählen setzt `fahrzeugId` jeder betroffenen Person auf `null` (Besatzungszuordnung). */
export function schalteFahrzeug(e: Entwurf, id: string): Entwurf {
  if (e.fahrzeuge.includes(id)) {
    return {
      ...e,
      fahrzeuge: e.fahrzeuge.filter((f) => f !== id),
      personal: e.personal.map((p): PersonAuswahl => (p.fahrzeugId === id ? { ...p, fahrzeugId: null } : p)),
    };
  }
  return { ...e, fahrzeuge: [...e.fahrzeuge, id] };
}

/** Person an-/abwählen. Abwählen entfernt sie ganz aus `personal`, Anwählen setzt `fahrzeugId: null`. */
export function schaltePerson(e: Entwurf, id: string): Entwurf {
  if (e.personal.some((p) => p.id === id)) {
    return { ...e, personal: e.personal.filter((p) => p.id !== id) };
  }
  return { ...e, personal: [...e.personal, { id, fahrzeugId: null }] };
}

/** Zähler-Eingabe (vor Ort / Transport): nur Ziffern, geklemmt auf 0..999 (Vorlage: `setze`). */
export function setzeZaehler(wert: string): number {
  const ziffern = wert.replace(/\D/g, "");
  const n = ziffern === "" ? 0 : Number.parseInt(ziffern, 10);
  return Math.min(n, 999);
}

/** Zeilen der Zusammenfassungs-Karte nach dem Absenden (Vorlage: `zusammenfassung`). */
export function zusammenfassung(e: Entwurf, s: Stammdatenpaket): { k: string; v: string }[] {
  const fzMap = new Map(s.stammdaten.fahrzeuge.map((f) => [f.id, f]));
  return [
    { k: "Alarmstichwort", v: e.stichwort || "—" },
    { k: "Beginn", v: e.beginnDatum ? `${datumText(e.beginnDatum)}, ${e.beginnZeit} Uhr` : "—" },
    { k: "Ende", v: e.endeDatum ? `${datumText(e.endeDatum)}, ${e.endeZeit} Uhr` : "offen" },
    { k: "Einsatzort", v: [e.strasse, e.ort].filter(Boolean).join(", ") || "—" },
    { k: "Fahrzeuge", v: e.fahrzeuge.map((id) => (fzMap.has(id) ? `${fzMap.get(id)!.typ} ${fzMap.get(id)!.kennung}` : id)).join(" · ") || "—" },
    { k: "Personal", v: `${e.personal.length} Kräfte` },
    { k: "Patienten", v: `${e.vorOrt} vor Ort · ${e.transport} mit Transport` },
  ];
}
