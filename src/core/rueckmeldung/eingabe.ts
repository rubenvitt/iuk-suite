/**
 * WAS DAS FLYIN AN DIE SERVER ACTION SCHICKT — und die Prüfung davon (IDA-214).
 *
 * ⚠️ ALLES HIER KOMMT AUS DEM BROWSER UND IST DAMIT NUR EINE ANGABE. Die Server
 * Action prüft jedes Feld, als hätte es jemand von Hand gebaut: Länge, Form,
 * Schema. Wer die Person ist, steht NICHT in der Eingabe, sondern kommt aus der
 * Sitzung (`senden.ts`) — ein Name aus dem Formular wäre frei wählbar.
 *
 * KEIN `"use client"` und kein `"use server"`: reine Typen und Funktionen, die
 * das Flyin (Grenzen für die Felder) und die Action (Prüfung) gemeinsam nutzen.
 */

export const ARTEN = ["fehler", "idee", "sonstiges"] as const;
export type RueckmeldungArt = (typeof ARTEN)[number];

export const TITEL_MIN = 3;
export const TITEL_MAX = 120;
export const TEXT_MAX = 5000;

export interface RueckmeldungEingabe {
  /** Vom Flyin je Formular vergeben; Zunder erkennt daran eine Wiederholung. */
  id: string;
  art: RueckmeldungArt;
  titel: string;
  text: string;
  modulKey: string;
  /** `location.href` beim Absenden; Query und Fragment schneidet die Vorlage ab. */
  seite: string;
  browser: string;
  /** `innerWidth×innerHeight`, z. B. `1280×800`. */
  fenster: string;
  /** Aufgelöstes `data-theme`: `light` oder `dark`. */
  thema: string;
}

export type RueckmeldungErgebnis = { ok: true; kennung: string } | { ok: false; grund: string };

type Pruefung = { ok: true; eingabe: RueckmeldungEingabe } | { ok: false; grund: string };

const text = (wert: unknown): string => (typeof wert === "string" ? wert : "");

function istSeite(wert: string): boolean {
  if (wert.length > 2000) return false;
  try {
    const { protocol } = new URL(wert);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Prüft die rohe Eingabe. Abgelehnt wird nur, was die Person selbst ändern kann
 * (Titel, Text, Art) oder was es ohne Manipulation nicht gibt (ID, Seite). Die
 * reinen Kontextangaben werden still geglättet: ein seltsamer Browser-String
 * ist kein Grund, eine Rückmeldung zu verlieren.
 */
export function pruefeEingabe(roh: unknown): Pruefung {
  const r = (roh ?? {}) as Record<string, unknown>;
  const id = text(r.id);
  const art = text(r.art);
  const titel = text(r.titel).trim();
  const inhalt = text(r.text).trim();
  const seite = text(r.seite).trim();

  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return { ok: false, grund: "Die Rückmeldung ist unvollständig. Lade die Seite neu und versuch es noch einmal." };
  if (!(ARTEN as readonly string[]).includes(art)) return { ok: false, grund: "Wähle aus, worum es geht." };
  if (titel.length < TITEL_MIN) return { ok: false, grund: `Der Titel braucht mindestens ${TITEL_MIN} Zeichen.` };
  if (titel.length > TITEL_MAX) return { ok: false, grund: `Der Titel darf höchstens ${TITEL_MAX} Zeichen haben.` };
  if (inhalt.length > TEXT_MAX) return { ok: false, grund: `Die Beschreibung darf höchstens ${TEXT_MAX} Zeichen haben.` };
  if (!istSeite(seite)) return { ok: false, grund: "Die Rückmeldung ist unvollständig. Lade die Seite neu und versuch es noch einmal." };

  const fenster = text(r.fenster);
  const thema = text(r.thema);
  return {
    ok: true,
    eingabe: {
      id,
      art: art as RueckmeldungArt,
      titel,
      text: inhalt,
      modulKey: text(r.modulKey).slice(0, 40),
      seite,
      browser: text(r.browser).slice(0, 400),
      fenster: /^\d{1,5}×\d{1,5}$/.test(fenster) ? fenster : "",
      thema: thema === "light" || thema === "dark" ? thema : "",
    },
  };
}
