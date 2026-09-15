"use server";

import { getDb, type DB } from "../_db/client";
import { quelleAufloeser } from "../_db/quelle";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { verfallSchwellen, verfallStatus, type Ampel } from "../_lib/domain/verfall";
import { chargeText } from "../_lib/format";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { artikelDetail } from "../_lib/lesepfade/artikel";
import { handlagerSchraenke } from "../_lib/lesepfade/orte";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/** Typ-Exporte verschwinden beim Kompilieren und sind keine Server Actions. */
export type ArtikelDetailCharge = {
  id: string;
  chargenNr: string;
  verfall: string;
  rest: number;
  ampel: Ampel;
  text: string;
};

export type ArtikelDetailBuchung = {
  id: string;
  ts: Date;
  typ: string;
  menge: number;
  kommentar: string | null;
  quelleName: string;
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
  const chargenErgebnis = detail.chargen
    .filter((charge) => charge.rest > 0)
    .map((charge): ArtikelDetailCharge => {
      const status = verfallStatus(charge.verfall, schwellen, jetzt);
      return {
        ...charge,
        ampel: status.ampel,
        text: chargeText(status, charge.verfall),
      };
    });

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
        quelleName: quelleName(buchung.quelleTyp, buchung.quelleId),
      })),
      mehrVorhanden: detail.mehrVorhanden,
      // Nur AKTIVE Orte — ein stillgelegter Schrank bleibt im Bestand, ist aber
      // kein Ziel mehr. Die Wurzel steht ausdrücklich darin.
      zielOrte: [
        { id: HANDLAGER_ID, name: "Handlager (ohne Schrank)", zugangshinweis: null },
        ...handlagerSchraenke(db, true).map((o) => ({
          id: o.id, name: o.name, zugangshinweis: o.zugangshinweis,
        })),
      ],
    },
  };
}
