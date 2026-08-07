"use server";

import { getDb, type DB } from "../_db/client";
import { quelleAufloeser } from "../_db/quelle";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { verfallSchwellen, verfallStatus, type Ampel } from "../_lib/domain/verfall";
import { chargeText } from "../_lib/format";
import { artikelDetail } from "../_lib/lesepfade/artikel";
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
  };
  chargen: ArtikelDetailCharge[];
  historie: ArtikelDetailBuchung[];
  mehrVorhanden: boolean;
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
    },
  };
}
