import { getDb } from "../../../_db/client";
import {
  tokenListe,
  tokenZiele,
  type TokenZeile,
} from "../../../_lib/lesepfade/tokens";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { NeuToken } from "./NeuToken";
import { TokenTable, type TokenAnzeigeZeile } from "./TokenTable";

export const dynamic = "force-dynamic";

/**
 * Die Client-Insel erhält ausschließlich serialisierbare Anzeigezeilen. Die
 * Zeitzone ist Teil des Fachvertrags; `createdAt` wird für diese Ansicht nicht
 * gebraucht und verlässt den Server deshalb nicht.
 */
export function tokenAnzeigeZeilen(zeilen: TokenZeile[]): TokenAnzeigeZeile[] {
  return zeilen.map((zeile) => ({
    id: zeile.id,
    code: zeile.code,
    label: zeile.label,
    aktiv: zeile.aktiv,
    lastUsedText: zeile.lastUsedAt
      ? zeile.lastUsedAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
      : "nie benutzt",
    zielTyp: zeile.zielTyp,
    zielId: zeile.zielId,
    zielName: zeile.zielName,
  }));
}

export default function TokensSeite() {
  const db = getDb();
  const zeilen = tokenAnzeigeZeilen(tokenListe(db));
  const ziele = tokenZiele(db);

  return (
    <>
      <SeitenKopf
        titel="Zugangs-Codes"
        beschreibung="Sechsstellige Codes für den Helfer-Weg. Ein Code zeigt entweder auf ein Fahrzeug, auf einen Artikel oder auf die Artikel-Liste."
        aktionen={<NeuToken ziele={ziele} />}
      />
      <TokenTable zeilen={zeilen} />
    </>
  );
}
