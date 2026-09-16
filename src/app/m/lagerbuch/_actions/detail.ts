"use server";

import { getDb, type DB } from "../_db/client";
import { quelleAufloeser } from "../_db/quelle";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { verfallSchwellen, verfallStatus, type Ampel } from "../_lib/domain/verfall";
import { chargeText } from "../_lib/format";
import { artikelDetail } from "../_lib/lesepfade/artikel";
import { verteilungJeCharge, type OrtVerteilungEintrag } from "../_lib/lesepfade/bestand";
import { ortZeile } from "../_lib/konstanten";
import { handlagerOrte, ortStamm, zugangsZiele } from "../_lib/lesepfade/orte";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/** Typ-Exporte verschwinden beim Kompilieren und sind keine Server Actions. */
export type ArtikelDetailCharge = {
  id: string;
  chargenNr: string;
  verfall: string;
  /** Rest im HANDLAGER-BEREICH — unveraendert die Grundlage von Mindestbestand,
   *  Verfallsliste und Kacheln (§5.2.1). */
  rest: number;
  /** DRK-297, Aufgabe 11 — Summe ueber ALLE Orte, Fahrzeuge eingeschlossen. */
  restGesamt: number;
  /** Die VERTEILUNG dieser Charge: wo wie viel liegt. Nicht zu verwechseln mit
   *  `zielOrte` (die waehlbaren ZIELE eines Zugangs). */
  /** DRK-309: samt Art — `OrtVerteilungEintrag`, dort steht die Begruendung. */
  orte: OrtVerteilungEintrag[];
  ampel: Ampel;
  text: string;
};

export type ArtikelDetailBuchung = {
  id: string;
  ts: Date;
  typ: string;
  menge: number;
  kommentar: string | null;
  /** ⚠️ MUSS MIT UEBER DIE GRENZE (DRK-344). Der Drawer beschriftet die Zeile
   *  ueber `journalZeile`, und unter `typ: "korrektur"` liegen Aussonderung,
   *  Inventurdifferenz und Handkorrektur — unterschieden allein durch dieses
   *  Praefix. Fehlte das Feld, stuende im Artikel-Verlauf weiter „Korrektur",
   *  waehrend das Journal daneben „Aussonderung" sagt. */
  referenz: string | null;
  quelleName: string;
  /** DRK-338 — der Ort dieser Zeile. Eine Umlagerung besteht aus ZWEI Zeilen
   *  mit demselben Vorgangstext; erst der Ort sagt, welche die Quelle und
   *  welche das Ziel ist. Ohne ihn stuende hier direkt nach dem Umlagern
   *  zweimal „Umlagerung", einmal −5 und einmal +5. */
  ortName: string;
};

export type ArtikelDetailResult = {
  artikel: {
    id: string;
    name: string;
    einheit: string;
    fach: string;
    mindestbestand: number;
    aktiv: boolean;
    bestand: number;
    kategorie: string | null;
  };
  chargen: ArtikelDetailCharge[];
  historie: ArtikelDetailBuchung[];
  mehrVorhanden: boolean;
  /**
   * DRK-297 — die waehlbaren ZIELE fuer einen Zugang: die Wurzel und die
   * AKTIVEN Handlager-Schraenke. Nicht zu verwechseln mit `orte` (Aufgabe 11,
   * die VERTEILUNG einer Charge) — zwei Felder namens `orte` mit
   * verschiedener Bedeutung waeren der zuverlaessigste Weg, ins falsche zu
   * greifen.
   */
  zielOrte: { id: string; name: string; zugangshinweis: string | null }[];
  /**
   * DRK-338 — DIE ORTE DES HANDLAGER-BEREICHS (Wurzel plus Schraenke), als
   * KENNUNGEN. Sie beantworten die eine Frage, die der Drawer sonst nicht
   * beantworten kann: welche Eintraege aus `chargen[].orte` sind Schraenke und
   * welche Fahrzeuge?
   *
   * ⚠️ STILLGELEGTE SCHRAENKE SIND DABEI, `zielOrte` daneben enthaelt nur die
   * aktiven — und der Unterschied ist Absicht, nicht Schlamperei: aus einem
   * stillgelegten Schrank umzulagern ist genau der Grund, warum man ihn
   * stillgelegt hat. Als ZIEL taugt er nicht mehr. Ein einziges Feld fuer beide
   * Fragen liesse eine der beiden still falsch werden.
   */
  handlagerOrtIds: string[];
};

/**
 * Client-Insel-Adapter fuer den bereits begrenzten Artikel-Lesepfad. Die Action
 * fuehrt keine zweite Buchungsabfrage aus und revalidiert als reiner Leser nicht.
 */
export async function getDetail(
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<ArtikelDetailResult>> {
  await requireLagerbuchAdmin();

  const detail = artikelDetail(db, id);
  if (!detail) return { ok: false, fehler: "Artikel nicht gefunden." };

  const jetzt = new Date();
  const schwellen = verfallSchwellen();
  const quelleName = quelleAufloeser(db);

  // DRK-297, Fixrunde 1 zu Aufgabe 12 — die Ortsverteilung (Verteilung, Rang,
  // Sortierung, Summe) ist jetzt der GEMEINSAME Kern aus
  // `_lib/lesepfade/bestand.ts`, den auch `artikelDetailHelfer` benutzt. Zwei
  // wortgleiche Kopien dieser Projektion liefen sonst garantiert auseinander.
  const verteilung = verteilungJeCharge(db, id);
  // Ein ZWEITER Durchlauf ueber `lagerorte` — bewusst, nicht uebersehen:
  // `verteilungJeCharge` laedt die Tabelle intern ebenfalls, und sie ist eine
  // Handvoll Zeilen (`_lib/lesepfade/orte.ts`: „wer hier optimiert, optimiert
  // das Falsche"). Die Alternative waere, `verteilungJeCharge` den Stamm
  // durchreichen zu lassen — das machte aus einem Aggregat einen Parameter,
  // den jeder Aufrufer richtig befuellen muss.
  const orte = ortStamm(db);

  const chargenErgebnis = detail.chargen
    .map((charge): ArtikelDetailCharge => {
      const v = verteilung.get(charge.id) ?? { orte: [], restGesamt: 0 };
      const status = verfallStatus(charge.verfall, schwellen, jetzt);
      return {
        ...charge,
        restGesamt: v.restGesamt,
        orte: v.orte,
        ampel: status.ampel,
        text: chargeText(status, charge.verfall),
      };
    })
    /**
     * ⚠️ DER FILTER GEHT AUF DIE SUMME ÜBER ALLE ORTE, nicht auf den
     * Handlager-Rest. Genau hier verschwand bisher jede Charge, die
     * vollständig im Fahrzeug lag: gemessen 7 Pkg., die in der Oberfläche
     * nicht vorkamen, während der Artikel „Bestand 5" zeigte.
     */
    .filter((charge) => charge.restGesamt > 0);

  return {
    ok: true,
    wert: {
      artikel: {
        id: detail.artikel.id,
        name: detail.artikel.name,
        einheit: detail.artikel.einheit,
        fach: detail.artikel.fach,
        mindestbestand: detail.artikel.mindestbestand,
        aktiv: detail.artikel.aktiv,
        bestand: detail.bestand,
        kategorie: detail.artikel.kategorie,
      },
      chargen: chargenErgebnis,
      historie: detail.buchungen.map((buchung) => ({
        id: buchung.id,
        ts: buchung.ts,
        typ: buchung.typ,
        menge: buchung.menge,
        kommentar: buchung.kommentar,
        referenz: buchung.referenz,
        quelleName: quelleName(buchung.quelleTyp, buchung.quelleId),
        // DRK-309: dieselbe Bewegungsliste wie im Journal, also dieselbe
        // Zeile. `ortStamm` traegt die Art seit Runde 14 mit.
        ortName: (() => {
          const o = orte.get(buchung.lagerortId);
          return o
            ? ortZeile(o)
            : ortZeile({
              name: buchung.lagerortId, typ: "lager", kennung: null, einheitenart: null,
            });
        })(),
      })),
      mehrVorhanden: detail.mehrVorhanden,
      // Nur AKTIVE Orte — ein stillgelegter Schrank bleibt im Bestand, ist aber
      // kein Ziel mehr. Die Wurzel steht ausdrücklich darin.
      // DRK-313 — DIESELBE Liste, die die Auffuellansicht anbietet
      // (`zugangsZiele`). Vorher stand sie hier ausgeschrieben; zwei
      // Schreibweisen haetten den beiden Flaechen verschiedene Orte gezeigt,
      // sobald eine von beiden `nurAktive` vergisst.
      zielOrte: zugangsZiele(db),
      // DRK-354 — HIER ENDET DER BEREICH als Typ: die Liste geht als Prop in
      // eine Client-Insel, und die stellt nur die Frage „liegt dieser Ort im
      // Handlager?" (`new Set(...)`). Ein `Lagerbereich` ueberquert die
      // RSC-Grenze ohnehin als nacktes Array; die Kopie sagt das hin.
      handlagerOrtIds: [...handlagerOrte(db)],
    },
  };
}
