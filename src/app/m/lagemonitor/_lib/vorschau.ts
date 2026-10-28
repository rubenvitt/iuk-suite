/**
 * Die Vorschau rechnet aus den Einstellungen im Formular und einer Beispiellage, was der Lagemonitor
 * zeigen würde — nach denselben Regeln wie dort (Repo `lagemonitor`, `frontend/src/monitor/selectLayout.ts`,
 * `Header.tsx`, `MonitorPage.tsx`): Warnungen ab der Schwelle stehen im Band, die darunter in der
 * Seitenspalte; eine Warnung im Band geht dem Suchlage-Einsatz in der Kopfzeile vor; das Drohnenbild
 * kommt nur bei laufendem Einsatz mit Livebild. Kein `"use client"`: reine Funktionen, in Vitest prüfbar.
 */
import { istWebadresse, rang, WARNSCHWELLEN, type Mitmachen, type Module, type SuchlageTeile, type Verkehr, type Warnschwelle } from "./konfiguration";

export const SZENARIEN = [
  { wert: "ruhe", text: "Ruhiger Tag" },
  { wert: "unwetter", text: "Unwetter" },
  { wert: "einsatz", text: "Suchlage-Einsatz" },
] as const;
export type Szenario = (typeof SZENARIEN)[number]["wert"];

export interface BeispielWarnung {
  id: string;
  titel: string;
  stufe: Warnschwelle;
  bis: string;
}

/** Erfundene Warnungen je Beispiellage. Der Einsatz läuft an einem Tag mit leichter Warnung. */
export const BEISPIEL_WARNUNGEN: Record<Szenario, BeispielWarnung[]> = {
  ruhe: [{ id: "frost", titel: "Leichter Frost", stufe: "Minor", bis: "280900okt26" }],
  unwetter: [
    { id: "starkregen", titel: "Unwetter: Heftiger Starkregen", stufe: "Severe", bis: "272100okt26" },
    { id: "sturm", titel: "Sturmböen", stufe: "Moderate", bis: "272300okt26" },
  ],
  einsatz: [{ id: "frost", titel: "Leichter Frost", stufe: "Minor", bis: "280900okt26" }],
};

/** Der Beispieleinsatz, wie Suchlage ihn melden würde. */
export const BEISPIEL_EINSATZ = { name: "Vermisste Person Oldenstadt", drohne: "Drohne 1", hoeheM: 60, akkuProzent: 71 } as const;

export const STUFE_TEXT: Record<Warnschwelle, string> = Object.fromEntries(WARNSCHWELLEN.map((s) => [s.wert, s.text])) as Record<Warnschwelle, string>;

export interface VorschauEingabe {
  standortName: string;
  regionName: string;
  warnschwelle: Warnschwelle;
  module: Module;
  suchlage: SuchlageTeile;
  mitmachen: Mitmachen;
  verkehr: Verkehr;
  /** Ein TomTom-Schlüssel ist hinterlegt oder eingetippt; ohne zeigt der Monitor Fluss und Baustellen nicht. */
  tomtom: boolean;
}

export type Ton = "normal" | "alarm" | "einsatz";

/** Eine Meldung fürs Band, wie die Vorschau sie zeigt; `countdown` schon als Text („in 42 min“). */
export interface VorschauMeldung {
  text: string;
  countdown: string | null;
  /** Noch nicht angelegt, nur im Formular getippt. */
  entwurf?: boolean;
}

/**
 * Der Countdown einer Meldung in Worten, wie der Lagemonitor ihn zeigt (Repo `lagemonitor`,
 * `frontend/src/monitor/countdown.ts`): „in 42 min“, „in 1 h 5 min“, „jetzt“, „seit 3 min“.
 */
export function countdownText(zielMs: number, jetztMs: number): string {
  const d = zielMs - jetztMs;
  if (d <= 0 && d > -60_000) return "jetzt";
  const minuten = d > 0 ? Math.ceil(d / 60_000) : Math.floor(-d / 60_000);
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  const dauer = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  return d > 0 ? `in ${dauer}` : `seit ${dauer}`;
}

export interface Vorschau {
  status: { text: string; ton: Ton };
  band: BeispielWarnung[];
  /** Warnungen unter der Schwelle in der Seitenspalte (nur mit Warnliste). */
  liste: BeispielWarnung[];
  karte: {
    radar: boolean;
    warngebiete: BeispielWarnung[];
    suchgebiete: boolean;
    flugspuren: boolean;
    drohne: boolean;
    verkehr: boolean;
    baustellen: boolean;
    blitzer: boolean;
  };
  wetter: boolean;
  seitenspalte: boolean;
  drohnenbild: boolean;
  /** Was zu sehen ist, in der Reihenfolge von oben nach unten. */
  sichtbar: string[];
  /** Was ausgeschaltet ist und deshalb fehlt. */
  aus: string[];
  meldungen: VorschauMeldung[];
  /** Der QR-Code fürs Ehrenamt, wenn er gerade zu sehen ist (nur in ruhiger Lage). */
  mitmachen: { adresse: string; text: string } | null;
}

const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

export function vorschau(e: VorschauEingabe, szenario: Szenario, meldungen: VorschauMeldung[] = []): Vorschau {
  const warnungen = BEISPIEL_WARNUNGEN[szenario];
  const schwelle = rang(e.warnschwelle);
  const band = warnungen.filter((w) => rang(w.stufe) >= schwelle);
  const darunter = warnungen.filter((w) => rang(w.stufe) < schwelle);
  const m = e.module;
  const einsatz = szenario === "einsatz" && m.suchlage;
  const liste = m.warnliste ? darunter : [];
  const seitenspalte = m.wetter || liste.length > 0;
  const drohnenbild = einsatz && e.suchlage.drohnenbild;
  const verkehr = e.verkehr.fluss && e.tomtom;
  const baustellen = e.verkehr.baustellen && e.tomtom;

  const status: Vorschau["status"] =
    band.length > 0
      ? { text: `${anzahl(band.length, "WARNUNG", "WARNUNGEN")} · ${STUFE_TEXT[band[0].stufe]}`, ton: "alarm" }
      : einsatz
        ? { text: `SUCHLAGE · ${BEISPIEL_EINSATZ.name}`, ton: "einsatz" }
        : darunter.length > 0
          ? { text: `RUHE · ${anzahl(darunter.length, "Warnung", "Warnungen")} unter Schwelle`, ton: "normal" }
          : { text: "RUHE · keine Warnungen", ton: "normal" };

  const sichtbar: string[] = [`Kopfzeile: ${e.standortName || "Standort"}, taktische Zeit und der Status in Worten („${status.text}“).`];
  if (band.length > 0) {
    sichtbar.push(`Rotes Band über allem: ${band.map((w) => w.titel).join(", ")}. Ab „${STUFE_TEXT[e.warnschwelle]}“ kommt eine Warnung ins Band.`);
  } else if (warnungen.length > 0) {
    sichtbar.push(`Kein Band: keine Warnung erreicht „${STUFE_TEXT[e.warnschwelle]}“.`);
  }
  for (const n of meldungen) {
    sichtbar.push(`Blaues Meldungsband${n.entwurf ? " (noch nicht angelegt)" : ""}: „${n.text}“${n.countdown ? `, ${n.countdown}` : ""}.`);
  }
  const kartenTeile = [
    verkehr && "Verkehrsfluss",
    m.radar && "Regenradar",
    m.warngebiete && warnungen.length > 0 && "Warngebiete",
    einsatz && e.suchlage.gebiete && "Suchgebiete",
    einsatz && e.suchlage.flugspuren && "Flugspuren aller Flüge im Einsatz",
    einsatz && "Drohnenposition",
    baustellen && "Baustellen und Sperrungen",
  ].filter((t): t is string => typeof t === "string");
  sichtbar.push(kartenTeile.length > 0 ? `Karte um ${e.standortName || "den Standort"} mit ${kartenTeile.join(", ")}.` : `Karte um ${e.standortName || "den Standort"}, ohne Ebenen.`);
  if ((e.verkehr.fluss || e.verkehr.baustellen) && !e.tomtom) {
    sichtbar.push("Kein Verkehr von TomTom: ohne Schlüssel holt der Monitor weder Verkehrsfluss noch Baustellen.");
  }
  if (e.verkehr.blitzer) {
    sichtbar.push("Feste Blitzer aus OpenStreetMap als Ring auf der Karte, nur am Online-Monitor. Der Bildschirm im FüKw zeigt sie nie.");
  }
  if (seitenspalte) {
    const teile = [m.wetter && `Wetter in ${e.standortName || "Standort"}`, liste.length > 0 && `${anzahl(liste.length, "Warnung", "Warnungen")} unter der Schwelle`].filter(Boolean);
    sichtbar.push(`Rechte Spalte: ${teile.join(" und ")}.`);
  } else {
    sichtbar.push("Keine rechte Spalte: die Karte nimmt die ganze Breite.");
  }
  if (drohnenbild) sichtbar.push(`Drohnenbild (${BEISPIEL_EINSATZ.drohne}) fährt von rechts ein, solange die Drohne ein Livebild sendet, und wieder hinaus, wenn es endet.`);
  if (einsatz && band.length > 0) sichtbar.push("Eine Warnung im Band hat in der Kopfzeile Vorrang vor dem Einsatz.");
  // Wie der Monitor (`MonitorPage.tsx`): der QR-Code nur, solange es ruhig ist.
  const ruhig = band.length === 0 && !einsatz;
  const qr = e.mitmachen.an && ruhig ? { adresse: e.mitmachen.adresse, text: e.mitmachen.text } : null;
  if (qr) {
    sichtbar.push(
      istWebadresse(qr.adresse)
        ? `QR-Code unten rechts auf der Karte: „${qr.text}“ führt zu ${qr.adresse}.`
        : "QR-Code unten rechts auf der Karte, sobald eine Webadresse eingetragen ist.",
    );
  } else if (e.mitmachen.an) {
    sichtbar.push("Kein QR-Code fürs Ehrenamt: bei einer Warnung im Band oder einem Einsatz gehört der Bildschirm der Lage.");
  }

  const aus = [
    !m.wetter && "Wetter",
    !m.radar && "Regenradar",
    !m.warngebiete && "Warngebiete auf der Karte",
    !m.warnliste && "Warnungen unter der Schwelle",
    !m.suchlage && "Suchlage",
    m.suchlage && !e.suchlage.flugspuren && "Flugspuren",
    m.suchlage && !e.suchlage.gebiete && "Suchgebiete",
    m.suchlage && !e.suchlage.drohnenbild && "Drohnenbild",
    !e.mitmachen.an && "QR-Code fürs Ehrenamt",
    !e.verkehr.fluss && "Verkehrsfluss",
    !e.verkehr.baustellen && "Baustellen",
    !e.verkehr.blitzer && "Blitzer",
  ].filter((t): t is string => typeof t === "string");

  return {
    status,
    band,
    liste,
    karte: {
      radar: m.radar,
      warngebiete: m.warngebiete ? warnungen : [],
      suchgebiete: einsatz && e.suchlage.gebiete,
      flugspuren: einsatz && e.suchlage.flugspuren,
      drohne: einsatz,
      verkehr,
      baustellen,
      blitzer: e.verkehr.blitzer,
    },
    wetter: m.wetter,
    seitenspalte,
    drohnenbild,
    sichtbar,
    aus,
    meldungen,
    mitmachen: qr,
  };
}
