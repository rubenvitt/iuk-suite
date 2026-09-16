"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import { NETZ_TEXT_BUCHUNG } from "../_lib/actionTypen";
// ⚠️ DIREKT IMPORTIERT, NICHT ALS PROP (Falle 9, `AGENTS.md`) — dieselbe
// Entscheidung wie in `Auffuellen.tsx`, und die dort ausgeschriebene
// Begruendung gilt hier unveraendert: die Ausnahme in `Entnahme.tsx` und
// `BoxAbgabe.tsx` lebt nur aus ihrer Vorgeschichte.
import { raeumeAusEntnahmebox } from "../_actions/entnahmebox";
import { ampelTon, fmtVerfall } from "../_lib/format";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
// NUR DER TYP, und er liegt in einem Modul OHNE "use client" (Falle 6):
// dieselbe Form liest die Server Component, die ihn befuellt.
//
// ⚠️ `EinraeumPosten` UND NICHT `BoxPosten`: die beiden zusaetzlichen Felder
// (Fach, Stilllegung) gibt es nur auf DIESEM Weg. Die Begruendung steht am Typ
// — `helfer/box` reicht `BoxPosten` unveraendert an seine Insel und sichert
// dort zu, dass nichts Ueberzaehliges im Payload liegt.
import type { EinraeumPosten } from "../_lib/lesepfade/entnahmebox";
import s from "./helfer.module.css";

/**
 * AUS DER ENTNAHMEBOX INS HANDLAGER — DRK-381.
 *
 * Die Gegenrichtung zu `_ui/BoxAbgabe.tsx`: dort wandert Material von der
 * Einheit in die Kiste, hier von der Kiste in einen Schrank.
 *
 * ── WARUM EINE EIGENE FLAECHE UND KEIN ZWEITER EINSTIEG IN `Auffuellen` ────
 *
 * Das war die erste offene Frage des Tickets, und die Antwort haengt an einem
 * Satz aus der Beschreibung: „muss sichtbar machen, dass hier etwas UMGERAEUMT
 * und nicht angenommen wird — sonst bucht jemand einen echten Wareneingang
 * ueber die Box."
 *
 * ⚠️ `Auffuellen.tsx` IST ARTIKELZENTRIERT, DIESE FLAECHE BESTANDSZENTRIERT,
 * und der Unterschied ist nicht kosmetisch. Dort waehlt man einen Artikel und
 * beantwortet „welche Charge, wie viel, wohin" — die Chargenliste enthaelt
 * ausdruecklich auch Chargen OHNE Bestand, weil frische Ware auf ein altes Los
 * gebucht werden darf. Hier gibt es nichts zu erfinden: es liegt genau das in
 * der Kiste, was darin liegt, mit genau den Chargen, die Bestand haben. Ein
 * Umschalter „Quelle: Lieferung / Entnahmebox" in jener Ansicht waere ein
 * Zustand, den man uebersieht — und uebersehen heisst hier: ein Wareneingang,
 * der dieselben Teile ein zweites Mal ins append-only-Journal schreibt.
 *
 * ⚠️ „EIGENE FLAECHE" HEISST NICHT „EIGENE WELT". Sie liegt im
 * Auffuell-Ast (`/auffuellen/box`), traegt denselben `AuffuellRahmen`, dieselbe
 * Bediendichte 56/72 und denselben Riegel — die User Story verlangt „im
 * vertrauten Stil der Entnahme", und das ist damit erfuellt. Was sich
 * unterscheidet, sind genau die Worte: „einraeumen", nie „auffuellen"; kein
 * „Neue Charge", weil aus einer Kiste keine neue Charge entsteht.
 *
 * ⚠️ KEIN antd UND KEIN `@ant-design/icons` (Fallen 1 und 7) — wie der ganze
 * Helfer- und Auffuell-Ast. `_lib/bauform.test.ts` riegelt das ab.
 */

/** Die waehlbaren Ziele: die Handlager-Wurzel plus die AKTIVEN Schraenke —
 *  dieselbe Liste und derselbe Typ wie in `Auffuellen.tsx` (`zugangsZiele`). */
export type EinraeumZiel = { id: string; name: string; zugangshinweis: string | null };

type Rueckmeldung = { art: "ok" | "fehler"; text: string };

/**
 * ⚠️ DIE CHARGE IST TEIL DER WAHL UND HAT KEINEN „EGAL"-WERT — anders als in
 * `BoxAbgabe`, und das ist eine fachliche Entscheidung, keine Vereinfachung.
 * Beim Ablegen ist FEFO ein zulaessiger Rueckfall (wer die Packung nicht
 * unterscheiden kann, nimmt die aelteste); beim Einraeumen liegt die Kiste
 * offen vor einem, und genau die Verfallsampel der Charge entscheidet, ob das
 * Teil ueberhaupt zurueck in den Schrank geht. Die Begruendung steht
 * ausgeschrieben an `EinraeumenSchema` (`_actions/entnahmebox.ts`).
 */
type Wahl = { artikelId: string; chargeId: string; menge: number; zielId: string };

export function BoxEinraeumen({
  boxName,
  posten,
  ziele,
}: {
  /** Aus `lagerorte.name`, nicht aus der Konstante: die Zeile ist umbenennbar. */
  boxName: string;
  /** Was in der Kiste liegt, nach Artikelnamen sortiert (`einraeumPosten`). Nie
   *  leer — den Leerfall beantwortet die Seite mit einem eigenen Zustand. */
  posten: EinraeumPosten[];
  /** Nie leer: die Wurzel gibt es immer. */
  ziele: EinraeumZiel[];
}) {
  const [wahl, setWahl] = useState<Wahl | null>(null);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();

  /*
   * ⚠️ VORBELEGT NUR BEI GENAU EINER WAHL — dieselbe Regel wie in
   * `Auffuellen.tsx` und aus demselben Grund (DRK-300): eine Vorbelegung, die
   * jemand uebersieht, raeumt Material still an den falschen Ort. Bei genau
   * einem Eintrag gibt es dagegen nichts zu entscheiden, und ein Pflicht-Tipp
   * auf die einzige Zeile waere reine Zeremonie.
   *
   * Das gilt fuer BEIDE Felder — die Charge (ein Posten mit nur einer) und das
   * Ziel (eine Anlage ohne Schraenke, in der nur die Wurzel zur Wahl steht).
   */
  function oeffnen(p: EinraeumPosten): void {
    setRueck(null);
    // ⚠️ EIN ZWEITER TIPP AUF DIESELBE ZEILE SCHLIESST SIE — wie in
    // `BoxAbgabe`: ohne diesen Zweig gaebe es keinen Weg zurueck aus einer
    // versehentlich geoeffneten Zeile ausser dem Absenden, und genau das waere
    // die Buchung, die niemand wollte.
    setWahl((vorher) =>
      vorher?.artikelId === p.artikelId
        ? null
        : {
            artikelId: p.artikelId,
            chargeId: p.chargen.length === 1 ? p.chargen[0]!.id : "",
            menge: 1,
            zielId: ziele.length === 1 ? ziele[0]!.id : "",
          },
    );
  }

  /** Der Rest GENAU DER gewaehlten Charge — die Obergrenze der Menge. Ohne
   *  Charge ist nichts waehlbar, und der Knopf ist ohnehin gesperrt. */
  function grenzeVon(p: EinraeumPosten, chargeId: string): number {
    const rest = p.chargen.find((c) => c.id === chargeId)?.rest ?? 0;
    // ⚠️ `BUCHUNG_MENGE_MAX` DECKELT MIT: der Bestand ist die FACHLICHE
    // Grenze, der Deckel die TECHNISCHE. `EinraeumenSchema` weist alles
    // darueber ab — mit „Die Eingabe war unvollständig", einem Satz, der auf
    // ein ausgefuelltes Formular nicht passt.
    return Math.min(rest, BUCHUNG_MENGE_MAX);
  }

  function absenden(p: EinraeumPosten): void {
    if (!wahl || wahl.artikelId !== p.artikelId) return;
    // Die zweite Haelfte derselben Zusage wie der gesperrte Knopf: ein
    // Tastendruck auf einen noch nicht neu gerenderten Knopf kaeme sonst durch.
    if (wahl.chargeId === "" || wahl.zielId === "" || laeuft) return;
    const menge = Math.min(wahl.menge, grenzeVon(p, wahl.chargeId));
    if (menge <= 0) return;
    setRueck(null);
    start(async () => {
      try {
        const r = await raeumeAusEntnahmebox({
          artikelId: p.artikelId,
          chargeId: wahl.chargeId,
          menge,
          zielLagerortId: wahl.zielId,
        });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          setRueck({ art: "fehler", text: r.text });
          return;
        }
        /*
         * DER BELEG NENNT MENGE, ARTIKEL UND ZIEL — und der ZIELNAME kommt aus
         * der ANTWORT, nicht aus dem Zustand hier: der Server weiss, wohin er
         * wirklich gebucht hat, und ein inzwischen umbenannter Schrank stuende
         * sonst unter seinem alten Namen im Beleg.
         *
         * ⚠️ „EINGERAEUMT", NICHT „AUFGEFUELLT". Derselbe Unterschied wie im
         * Journalkommentar (`ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR`): aufgefuellt
         * wird mit einer Lieferung, hier wurde nur umgeraeumt.
         */
        setRueck({
          art: "ok",
          text: `Eingeräumt: ${r.wert.eingeraeumt} × ${p.artikelName} → ${r.wert.ziel}`,
        });
        // Die Zeile schliesst nach dem Erfolg — wie in `BoxAbgabe`: sie offen
        // zu lassen hiesse, ein gefuelltes Mengenfeld ueber einer Liste stehen
        // zu lassen, deren Zahlen der naechste Serverstand gerade aendert.
        setWahl(null);
      } catch {
        // `"netz"` entsteht ausschliesslich HIER, nie serverseitig (Global
        // Constraint 12).
        setRueck({ art: "fehler", text: NETZ_TEXT_BUCHUNG });
      }
    });
  }

  return (
    <div className={s.lesebahn}>
      <Link className={s.rueckweg} href="/auffuellen" data-rolle="einraeumen-rueckweg">
        <Ikone name="chevron-links" groesse={15} />
        Zurück
      </Link>

      <div className={s.zeile}>
        <h1 className={s.zeileHaupt} style={{ font: "700 24px var(--lb-display)", lineHeight: 1.12 }}>
          {boxName}
        </h1>
      </div>

      {/*
        ⚠️ DER SATZ SAGT DIE RICHTUNG UND DIE ART DES VORGANGS. Er steht hier
        aus demselben Grund wie der Hinweis auf `/auffuellen`: die Flaeche sieht
        der Entnahme und dem Auffuellen zum Verwechseln aehnlich — das ist
        Absicht (der vertraute Ablauf war die Anforderung) und genau deshalb die
        Gefahr. „Umgeraeumt, nicht angenommen" ist der Unterschied, an dem sonst
        ein doppelter Buchbestand entsteht.
      */}
      <p className={s.fussnote} data-rolle="einraeumen-hinweis">
        Was hier liegt, wurde aus einem Fahrzeug oder einer Tasche genommen. Du räumst
        es zurück ins Handlager — umgeräumt, nicht neu angenommen. Eine Lieferung buchst
        du unter „Auffüllen“.
      </p>

      {rueck && (
        <span
          className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot} ${s.rueckmeldung}`}
          data-rolle="einraeumen-ergebnis"
          role="status"
        >
          {rueck.text}
        </span>
      )}

      <div className={s.karte}>
        <div className={s.karteTitel}>Liegt in der Kiste</div>
        {posten.map((p) => {
          const offen = wahl?.artikelId === p.artikelId;
          const zielName = offen ? (ziele.find((z) => z.id === wahl.zielId)?.name ?? null) : null;
          const bereit = offen && wahl.chargeId !== "" && wahl.zielId !== "" && !laeuft;
          return (
            <div key={p.artikelId} data-rolle="einraeum-posten">
              <button
                type="button"
                className={`${s.zeile} ${s.zeileKnopf}`}
                onClick={() => oeffnen(p)}
                aria-expanded={offen}
                data-rolle="einraeum-posten-knopf"
              >
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{p.artikelName}</div>
                  <div className={s.zeileMeta}>
                    {/*
                      ⚠️ DAS FACH STEHT IN DER ZUSAMMENFASSUNGSZEILE, weil es
                      hier die eigentliche Frage beantwortet: wohin gehoert das?
                      Es ist NICHT der Schrank (die beiden haengen in den Daten
                      nicht zusammen, siehe `EinraeumPosten.fach`) — es ist die
                      Regalangabe, aus der die Person den Schrank erschliesst.
                    */}
                    <span data-rolle="einraeum-fach">{p.fach}</span>
                    {/*
                      ⚠️ DER STATUS ALS TEXT, nie allein ueber Farbe — und in
                      der zugeklappten Zeile besonders: hier entscheidet sich,
                      ob jemand den Posten ueberhaupt aufklappt oder das Teil
                      gleich aussondert.
                    */}
                    {p.chargen.map((c) => (
                      <HelferChip key={c.id} ton={ampelTon(c.ampel)}>
                        {c.text}
                      </HelferChip>
                    ))}
                    {/*
                      ⚠️ DIE STILLLEGUNG WIRD BENANNT, NICHT VERHINDERT — die
                      dritte offene Frage des Tickets. Ein stillgelegter Artikel
                      laesst sich einraeumen, und das ist die bewusste Antwort:
                      es gibt heute keinen Weg, aus der Kiste auszusondern, ein
                      Verbot liesse das Material also dauerhaft darin liegen —
                      an einem Ort, den weder Verfallsliste noch Inventur sehen.
                      Im Schrank sieht die Verfallsliste es wieder. Dass der
                      Artikel nicht mehr gefuehrt wird, gehoert trotzdem auf den
                      Schirm: sonst trifft jemand die Entscheidung, ohne zu
                      wissen, dass er sie trifft.
                    */}
                    {!p.artikelAktiv && (
                      <HelferChip ton="grau">stillgelegt</HelferChip>
                    )}
                  </div>
                </div>
                <div className={s.mengenChip}>
                  {p.menge}
                  <small>{p.einheit}</small>
                </div>
                <Ikone name={offen ? "zuklappen" : "aufklappen"} />
              </button>

              {offen && wahl && (
                <div className={s.kartePad} data-rolle="einraeum-eingabe">
                  {/*
                    ⚠️ DIE CHARGENWAHL ERSCHEINT AUCH BEI GENAU EINER CHARGE
                    NICHT — dann ist sie vorbelegt (`oeffnen`), und eine
                    Radiogruppe mit einem Knopf ist eine Bedienung ohne Wirkung.
                    Die Charge steht in dem Fall trotzdem auf dem Schirm: als
                    Chip in der Zeile darueber.
                  */}
                  {p.chargen.length > 1 && (
                    <fieldset
                      style={{ border: "none", padding: 0, margin: "0 0 10px" }}
                      data-rolle="einraeum-chargenwahl"
                    >
                      <legend className={s.fussnote} style={{ padding: 0 }}>
                        Welche Charge räumst du ein?
                      </legend>
                      {p.chargen.map((c) => (
                        <label key={c.id} className={`${s.zeile} ${s.zeileWahl}`}>
                          <input
                            type="radio"
                            name={`einraeum-charge-${p.artikelId}`}
                            className={s.wahlKnopf}
                            checked={wahl.chargeId === c.id}
                            onChange={() =>
                              setWahl({ ...wahl, chargeId: c.id, menge: Math.min(wahl.menge, c.rest) })
                            }
                          />
                          <div className={s.zeileHaupt}>
                            <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
                            <div className={s.zeileMeta}>
                              <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
                              <span>{fmtVerfall(c.verfall)}</span>
                            </div>
                          </div>
                          <div className={s.mengenChip}>
                            {c.rest}
                            <small>{p.einheit}</small>
                          </div>
                        </label>
                      ))}
                    </fieldset>
                  )}

                  {/*
                    ⚠️ DAS ZIEL WIRD JE BUCHUNG GEWAEHLT, NICHT EINMAL FUER DIE
                    GANZE KISTE. Der naheliegende Bau waere ein Schrank oben am
                    Schirm — er waere falsch: jeder Artikel hat sein eigenes
                    Fach, und ein einmal gesetztes Ziel stuende danach still
                    falsch fuer den naechsten Posten. Dieselbe Regel wie bei der
                    Vorbelegung (DRK-300): was uebersehen werden kann, raeumt
                    Material an den falschen Ort.
                  */}
                  <fieldset
                    style={{ border: "none", padding: 0, margin: "0 0 10px" }}
                    data-rolle="einraeum-zielwahl"
                  >
                    <legend className={s.fussnote} style={{ padding: 0 }}>
                      Wohin?
                    </legend>
                    {ziele.map((z) => (
                      <label
                        key={z.id}
                        className={`${s.zeile} ${s.zeileWahl}`}
                        data-rolle="einraeum-ziel-zeile"
                      >
                        <input
                          type="radio"
                          name={`einraeum-ziel-${p.artikelId}`}
                          className={s.wahlKnopf}
                          checked={wahl.zielId === z.id}
                          onChange={() => setWahl({ ...wahl, zielId: z.id })}
                        />
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>{z.name}</div>
                          {/* Die Bedingung ist die Zusage: ein bedingungsloses
                              Meta-Feld waere ohne Hinweis eine LEERE Zeile mit
                              Abstand. */}
                          {z.zugangshinweis && <div className={s.zeileMeta}>{z.zugangshinweis}</div>}
                        </div>
                      </label>
                    ))}
                  </fieldset>

                  <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
                    <span className={s.zeileHaupt}>Menge</span>
                    <Stepper
                      wert={wahl.menge}
                      setWert={(m) => setWahl({ ...wahl, menge: m })}
                      min={1}
                      max={Math.max(grenzeVon(p, wahl.chargeId), 1)}
                      beschriftung={`Menge ${p.artikelName}`}
                    />
                  </div>

                  {/*
                    DIE ZUSAMMENFASSUNG STEHT ALS LETZTE ZEILE UEBER DEM KNOPF,
                    weil sie die letzte ist, die jemand liest, bevor er tippt —
                    dieselbe Bauform wie in `Auffuellen.tsx`. Sie wiederholt
                    nicht nur: Menge, Artikel und Ziel stehen sonst in drei
                    verschiedenen Bloecken.
                  */}
                  <div
                    className={`${s.zeile} ${s.zielZeile}`}
                    style={{ borderTop: "none", padding: "11px 0" }}
                    data-rolle="einraeum-zusammenfassung"
                  >
                    <span className={s.zeileHaupt}>Buchung</span>
                    <span className={`${s.zielWert} ${zielName === null ? s.zielOffen : ""}`}>
                      {wahl.chargeId === ""
                        ? "Noch keine Charge gewählt"
                        : zielName === null
                          ? "Noch kein Schrank gewählt"
                          : `${wahl.menge} ${p.einheit} ${p.artikelName} → ${zielName}`}
                    </span>
                  </div>

                  {/*
                    ⚠️ DER KNOPF IST NICHT ROT. Rot traegt auf diesen Flaechen
                    die Bedeutung „Bestand geht weg" (der Entnahme-Knopf, der
                    Knopf in `BoxAbgabe`) und in den Chips die Ampel (Falle 3).
                    Hier kommt Bestand ins Handlager — dieselbe Begruendung wie
                    in `Auffuellen.tsx`.
                  */}
                  <button
                    className={`${s.knopf} ${s.knopfTinte} ${s.knopfBreit}`}
                    type="button"
                    disabled={!bereit}
                    onClick={() => absenden(p)}
                    data-rolle="einraeumen-buchen"
                  >
                    Einräumen buchen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
