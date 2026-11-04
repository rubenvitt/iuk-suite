/**
 * DIE ABLAGE DER ENTWÜRFE AUF DEM GERÄT — IDA-358.
 *
 * Am 04.11.2026 lief ein Rollout, während jemand einen Fahrzeugcheck abschließen
 * wollte: das Absenden scheiterte, und auf dem Gerät war danach nichts mehr. Der
 * ganze Zählstand lag in `useState` — ein Neuladen, ein Versions-Neuladen von
 * Next.js oder ein geschlossener Tab, und die Arbeit war weg. Diese Datei ist der
 * Speicher, der das für jedes Modul verhindert; `useEntwurf.ts` ist der Hook davor.
 *
 * ⚠️ `localStorage`, NICHT IndexedDB — und das ist eine Abwägung, kein Versehen.
 * Der tragende Moment ist das Wegräumen der Seite (`pagehide`, Neuladen durch
 * einen Versionswechsel): dort kommt nur ein SYNCHRONER Schreibzugriff sicher an,
 * eine IndexedDB-Transaktion kann der Browser mitten im Abbau verwerfen. Die
 * Grenze von ~5 MB je Herkunft trägt Formulareingaben um Größenordnungen; Dateien
 * und Fotos gehören nicht hier hinein. Beide Speicher räumt Safari nach sieben
 * Tagen ohne Besuch gleichermaßen (ITP) — IndexedDB wäre da kein Gewinn.
 *
 * ⚠️ `localStorage` KANN WERFEN (privates Fenster, gesperrte Website-Daten, voll).
 * Dann trägt ein Speicher im Arbeitsspeicher weiter: er übersteht kein Neuladen,
 * hält aber wenigstens den Stand für die erneuten Sendeversuche derselben Seite.
 *
 * KEIN "use client": nur Funktionen, kein Hook (Falle 6, `CLAUDE.md`).
 */
import dayjs from "dayjs";

export const PRAEFIX = "iuk-entwurf:";

/**
 * Wie lange ein liegen gelassener Entwurf bleibt. Lang genug für „Check am
 * Samstag angefangen, am Dienstag weitergemacht", kurz genug, dass ein geteiltes
 * Gerät nicht wochenalte Eingaben der Vorperson zeigt.
 */
export const HALTBARKEIT_MS = 14 * 24 * 60 * 60 * 1000;

export type Sendung = {
  /** Bleibt über alle Versuche gleich — der Server erkennt daran eine Wiederholung. */
  id: string;
  nutzlast: unknown;
  seit: number;
  versuche: number;
  /** Die Seite wurde für diese Sendung schon einmal neu geladen (`useEntwurf.ts`). */
  neugeladen?: boolean;
};

export type Eintrag<S = unknown> = {
  stand: S;
  geaendert: number;
  /** Wo der Entwurf entstand — für eine spätere Übersicht offener Entwürfe. */
  pfad: string;
  sendung: Sendung | null;
};

/*
 * dayjs-Werte (antd `DatePicker`/`TimePicker`) überleben `JSON.stringify` nur als
 * Zeichenkette und kämen als solche in ein Formular zurück, das ein dayjs-Objekt
 * erwartet. Sie bekommen eine Marke und werden beim Lesen wieder belebt.
 *
 * ⚠️ `toJSON` läuft VOR dem Replacer: der Replacer sieht für einen dayjs-Wert
 * schon die Zeichenkette. Deshalb wird am Elternobjekt (`this[schluessel]`)
 * geprüft, nicht am übergebenen Wert.
 */
const DAYJS = "$dayjs";

export function serialisiere(wert: unknown): string {
  return JSON.stringify(wert, function (this: Record<string, unknown>, schluessel, w) {
    const roh = this[schluessel];
    if (dayjs.isDayjs(roh)) return { [DAYJS]: roh.toISOString() };
    if (roh instanceof Date) return { [DAYJS]: roh.toISOString(), datum: true };
    return w;
  });
}

export function deserialisiere<T>(text: string): T {
  return JSON.parse(text, (_s, w) => {
    if (w && typeof w === "object" && typeof (w as Record<string, unknown>)[DAYJS] === "string") {
      const iso = (w as Record<string, string>)[DAYJS];
      return (w as { datum?: boolean }).datum ? new Date(iso) : dayjs(iso);
    }
    return w;
  }) as T;
}

const fluechtig = new Map<string, string>();

function speicher(): Storage | null {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function roh(schluessel: string): string | null {
  const k = PRAEFIX + schluessel;
  try {
    const s = speicher();
    const w = s?.getItem(k);
    if (w != null) return w;
  } catch {
    /* weiter mit dem flüchtigen Stand */
  }
  return fluechtig.get(k) ?? null;
}

export function ladeEntwurf<S>(schluessel: string, jetzt = Date.now()): Eintrag<S> | null {
  const text = roh(schluessel);
  if (text == null) return null;
  try {
    const e = deserialisiere<Eintrag<S>>(text);
    if (!e || typeof e !== "object" || !("stand" in e)) return null;
    // Eine offene Sendung verfällt nicht: sie ist eine Zusage, dass etwas ankommt.
    if (!e.sendung && jetzt - (e.geaendert ?? 0) > HALTBARKEIT_MS) {
      loescheEntwurf(schluessel);
      return null;
    }
    return e;
  } catch {
    return null;
  }
}

/** Gibt `false` zurück, wenn nur noch der flüchtige Speicher trägt. */
export function speichereEntwurf<S>(schluessel: string, eintrag: Eintrag<S>): boolean {
  const k = PRAEFIX + schluessel;
  const text = serialisiere(eintrag);
  fluechtig.set(k, text);
  try {
    const s = speicher();
    if (!s) return false;
    s.setItem(k, text);
    return true;
  } catch {
    return false;
  }
}

export function loescheEntwurf(schluessel: string): void {
  const k = PRAEFIX + schluessel;
  fluechtig.delete(k);
  try {
    speicher()?.removeItem(k);
  } catch {
    /* nichts zu tun */
  }
}

/** Alle Schlüssel (ohne Präfix) mit Entwurf auf diesem Gerät. */
export function entwurfSchluessel(): string[] {
  const aus = new Set<string>();
  for (const k of fluechtig.keys()) aus.add(k.slice(PRAEFIX.length));
  try {
    const s = speicher();
    if (s) {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(PRAEFIX)) aus.add(k.slice(PRAEFIX.length));
      }
    }
  } catch {
    /* nur der flüchtige Stand */
  }
  return [...aus];
}

/** Räumt abgelaufene Entwürfe weg (`ladeEntwurf` löscht beim Lesen). */
export function raeumeAuf(jetzt = Date.now()): void {
  for (const k of entwurfSchluessel()) ladeEntwurf(k, jetzt);
}

/** Nur für Tests: den flüchtigen Speicher leeren. */
export function vergissFluechtig(): void {
  fluechtig.clear();
}
