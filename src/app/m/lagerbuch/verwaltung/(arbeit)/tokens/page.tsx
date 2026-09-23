import { getDb } from "../../../_db/client";
import { einheitMeta, standortMeta } from "../../../_lib/konstanten";
import { etikettOrte } from "../../../_lib/lesepfade/ortEtiketten";
import { tokenListe, type TokenZeile } from "../../../_lib/lesepfade/tokens";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { TokenTable, type TokenAnzeigeZeile } from "./TokenTable";
import { zeitzone } from "@/core/zeit";

export const dynamic = "force-dynamic";

/**
 * Die Client-Insel erhält ausschließlich serialisierbare Anzeigezeilen. Die
 * Zeitzone ist Teil des Fachvertrags; `createdAt` wird für diese Ansicht nicht
 * gebraucht und verlässt den Server deshalb nicht.
 *
 * ⚠️ DRK-406 — DIE ORTSZEILE ENTSTEHT HIER UND NICHT IN DER INSEL. `ortZeile`
 * und `standortMeta` liegen in `_lib/konstanten.ts`, also in einem Modul ohne
 * `"use client"`; sie wären auch aus der Insel erreichbar. Sie stehen trotzdem
 * hier, weil die Insel dann eine zweite Stelle wäre, an der aus `typ`,
 * `kennung` und `einheitenart` eine Beizeile entsteht — und die Ortskarte
 * daneben (`_db/etiketten.ts`) baut ihre aus derselben Funktion. Zwei
 * Schreibweisen für dieselbe Zeile auf zwei Flächen lassen den Leser einen
 * Unterschied vermuten.
 */
export function tokenAnzeigeZeilen(
  zeilen: TokenZeile[],
  /**
   * DIE IDS DER ORTE, DIE HEUTE EINE KARTE HABEN — DRK-406.
   *
   * ⚠️ SIE ENTSCHEIDEN, OB EIN CODE ZURÜCKSETZBAR IST, und das ist nicht
   * dasselbe wie „hat eine `ortId`". Wird eine Tasche stillgelegt, bleibt ihr
   * Code mit seiner `ortId` in der Liste stehen — aber es gibt keine Karte
   * mehr, auf die ein neuer Code käme. Der Knopf verschwände sonst erst, wenn
   * die Action ihn abweist; `etikettOrt` lehnt genau so ab.
   */
  kartenOrte: ReadonlySet<string>,
): TokenAnzeigeZeile[] {
  return zeilen.map((zeile) => ({
    id: zeile.id,
    code: zeile.code,
    label: zeile.label,
    aktiv: zeile.aktiv,
    lastUsedText: zeile.lastUsedAt
      ? zeile.lastUsedAt.toLocaleString("de-DE", { timeZone: zeitzone() })
      : "nie benutzt",
    /**
     * ⚠️ DER ROHWERT REIST MIT, WEIL DIE SPALTE DANACH SORTIERT.
     * `lastUsedText` ist „14.9.2026, 08:12:00" beziehungsweise „nie benutzt" —
     * als Zeichenkette sortiert stuende der 2. Oktober vor dem 14. September
     * und „nie benutzt" mitten zwischen den Daten. `null` landet aufsteigend
     * hinten.
     */
    lastUsedIso: zeile.lastUsedAt ? zeile.lastUsedAt.toISOString() : null,
    ortId: zeile.ortId,
    ortName: zeile.ortName,
    /*
     * ⚠️ `standortMeta` UND NICHT `einheitMeta`: der Handlager ist ein
     * `typ: "lager"`, und `einheitMeta` machte daraus „nicht zugeordnet" statt
     * „Lager" — also eine Einheit, bei der jemand die Art vergessen hat
     * (DRK-309). Dieselbe Weiche wie auf der Ortskarte.
     */
    ortMeta: zeile.ortTyp
      ? standortMeta({
        typ: zeile.ortTyp,
        kennung: zeile.ortKennung,
        einheitenart: zeile.ortEinheitenart,
      })
      : null,
    zuruecksetzbar: zeile.ortId !== null && kartenOrte.has(zeile.ortId),
    /**
     * ⚠️ NUR DER TAG, NICHT DIE UHRZEIT — anders als `lastUsedText` daneben.
     * Die Frage, die dieser Wert beantwortet, ist „galt mein Foto damals
     * noch?"; auf die Minute genau zu antworten hieße, eine Schärfe zu
     * behaupten, die niemand braucht, und die Zeile unnötig breit zu machen.
     */
    ersetztText: zeile.ersetztAm
      ? zeile.ersetztAm.toLocaleDateString("de-DE", { timeZone: zeitzone() })
      : null,
    zielTyp: zeile.zielTyp,
    zielId: zeile.zielId,
    zielName: zeile.zielName,
    zielMeta: zeile.zielTyp === "fahrzeug"
      ? einheitMeta({ kennung: zeile.zielKennung, einheitenart: zeile.zielEinheitenart })
      : null,
    zielEinheitenart: zeile.zielEinheitenart,
  }));
}

/**
 * DIE ZUGANGS-CODES — seit DRK-406 eine reine ÜBERSICHT mit zwei Griffen
 * (sperren, neu erzeugen), kein Anlegewerkzeug mehr.
 *
 * ⚠️ DER NACHZUG STEHT HIER NICHT. Er läuft beim Öffnen der ORTSETIKETTEN
 * (Betreiberentscheidung 17.09.2026), und diese Seite zeigt nur, was da ist.
 * Das ist keine Willkür: die Ortsetiketten sind die Fläche, auf der die Codes
 * gebraucht werden — wer sie öffnet, will drucken. Ein zweiter Erzeugungspunkt
 * hier machte aus einem Blick in die Liste einen Schreibvorgang, und der Zähler
 * „so viele sind neu entstanden" hätte dann zwei Orte, an denen er auftaucht.
 */
export default function TokensSeite() {
  const db = getDb();
  const kartenOrte = new Set(etikettOrte(db).map((o) => o.id));
  const zeilen = tokenAnzeigeZeilen(tokenListe(db), kartenOrte);

  return (
    <>
      <SeitenKopf
        titel="Zugangs-Codes"
        beschreibung="Der Handlager, jedes Fahrzeug und jede Tasche haben genau einen Code. Er entsteht automatisch und steht auf der Ortskarte. Wird ein Code missbraucht, erzeuge ihn hier neu — der alte ist damit dauerhaft gesperrt."
      />
      <TokenTable zeilen={zeilen} />
    </>
  );
}
