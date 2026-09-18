"use client";

/**
 * EINE ZAEHLZEILE ALS KARTE — die Inventur auf dem Telefon (DRK-421).
 *
 * ⚠️ WAS HIER WEGGELASSEN IST, IST DIE ENTSCHEIDUNG. Die Tabelle hat acht
 * Spalten; eine Karte, die alle acht untereinander wiederholt, ist kein
 * Fortschritt, sondern dieselbe Zeile hochkant. Gezeigt wird, was beim Zaehlen
 * VOR DEM SCHRANK gebraucht wird:
 *
 *  * Der NAME, gross und zuerst — die Frage lautet „welcher Artikel ist das".
 *  * Die ABWEICHUNG daneben, weil sie die einzige Zahl ist, die sich aendert.
 *  * Kategorie, Fach, naechstes MHD als eine Zeile Merkmale — Fach ist der Weg
 *    zum Regal, MHD entscheidet, ob ueberhaupt gezaehlt werden muss.
 *  * Erwartung und Mindestbestand als eine Zeile Zahlen.
 *  * Der STEPPER ueber die volle Breite. In der Tabelle steht er in der achten
 *    von acht Spalten; wer ihn auf 390px bedient, hat den Namen nicht mehr im
 *    Bild. Genau das war die Meldung, aus der dieses Ticket entstand.
 *
 * ⚠️ DIE CHARGEN STEHEN ZUGEKLAPPT, UND NICHT AUS PLATZGRUENDEN. `ChargenZelle`
 * bringt je Charge drei weitere Bedienelemente mit; stuenden sie offen, waere
 * die Karte fuer die HAEUFIGE Zaehlung (eine Zahl je Artikel) unbrauchbar, um
 * den SELTENEN Fall zu bedienen. Aufgeklappt wird je Karte einzeln — der
 * Zustand liegt deshalb hier und nicht oben.
 */

import { useState } from "react";
import { Button } from "antd";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";
import { AbweichungsZelle, ChargenZelle, IstZelle } from "./InventurZellen";
import type { Zaehlspeicher } from "./zaehlspeicher";
import k from "./inventurkarte.module.css";

export function InventurKarte({ zeile, speicher, gesperrt, ortText }: {
  zeile: InventurZeile;
  speicher: Zaehlspeicher;
  gesperrt: boolean;
  ortText: string;
}) {
  const [chargenOffen, setChargenOffen] = useState(false);
  const naechste = zeile.chargen[0];

  return (
    <article className={k.karte}>
      <div className={k.kopf}>
        <span className={k.name}>{zeile.name}</span>
        <AbweichungsZelle zeile={zeile} speicher={speicher} />
      </div>

      <p className={k.merkmale}>
        <span>{zeile.kategorie ?? "Ohne Kategorie"}</span>
        <span className={s.fach}>{zeile.fach}</span>
        {naechste ? (
          <Chip ton={ampelTon(naechste.ampel)}>{fmtVerfall(naechste.verfall)}</Chip>
        ) : null}
      </p>

      {/* ⚠️ „erwartet", NICHT „Bestand". In der Tabelle steht die Spalte neben
          sieben anderen und der Kopf erklaert sie; hier steht die Zahl allein,
          und dann muss das Wort sagen, wogegen gezaehlt wird (DRK-337: die Zahl
          gilt fuer den gewaehlten Zaehlort, nicht fuer den ganzen Handlager). */}
      <p className={k.zahlen}>
        {`erwartet ${zeile.bestand} ${zeile.einheit} · Min. ${zeile.mindestbestand}`}
      </p>

      <IstZelle zeile={zeile} speicher={speicher} gesperrt={gesperrt} className={k.stepper} />

      {/* ⚠️ SICHTBARER TEXT KURZ, BESCHRIFTUNG VOLLSTAENDIG. „Chargen Mullbinde
          anzeigen" auf dem Knopf waere auf 390px ein Umbruch und steht ohnehin
          schon als Ueberschrift daneben; eine Vorleseanwendung dagegen springt
          von Knopf zu Knopf und braeuchte ohne den Namen dreihundertmal
          „Chargen anzeigen". Derselbe Name wie am Aufklappknopf der Tabelle —
          gesehen wird immer nur einer von beiden. */}
      <Button
        aria-expanded={chargenOffen}
        aria-label={chargenOffen ? `Chargen ${zeile.name} ausblenden` : `Chargen ${zeile.name} anzeigen`}
        onClick={() => setChargenOffen((offen) => !offen)}
        icon={<Ikone name={chargenOffen ? "zuklappen" : "aufklappen"} groesse={14} />}
      >
        {chargenOffen ? "Chargen ausblenden" : "Chargen anzeigen"}
      </Button>

      {chargenOffen ? (
        <div className={k.chargen}>
          <ChargenZelle
            zeile={zeile}
            speicher={speicher}
            gesperrt={gesperrt}
            ortText={ortText}
          />
        </div>
      ) : null}
    </article>
  );
}
