"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Input, InputNumber } from "antd";
import { flascheSpeichern } from "../../../../_actions/sauerstoff";
import {
  wechselGrenzeBar,
  O2_WECHSEL_MAX_PROZENT,
  O2_WECHSEL_MIN_PROZENT,
} from "../../../../_lib/domain/o2";
import { Stammdaten, StammdatenEingabe } from "../../../../_ui/Stammdaten";

const SPEICHER_FEHLER = "Sauerstoffflasche konnte nicht gespeichert werden.";

type ReferenzWerte = {
  id: string;
  name: string;
  lagerortId: string;
  groesseLiter: number | null;
  nennfuelldruckBar: number;
  /**
   * % vom Nennfuelldruck, ab dem der Wechselhinweis erscheint (DRK-308).
   *
   * ⚠️ DIESES FELD MUSS MITREISEN, auch wenn niemand es anfasst. `flascheSpeichern`
   * schreibt die Stammzeile GANZ, und das Zod-Schema belegt einen fehlenden Wert
   * mit der Vorgabe 25 vor. Ohne die Zeile im `speichern`-Aufruf unten setzte
   * also jede Namensaenderung den eingestellten Grenzwert still auf 25 zurueck —
   * eine Datenaenderung, die niemand ausgeloest hat und die kein Tor sieht.
   */
  wechselAbProzent: number;
};

/**
 * DIE STAMMDATEN DER FLASCHE — SEIT IDA-239 EIN LESEMODUS MIT „BEARBEITEN".
 *
 * Vorher standen die vier Felder offen VOR „Neue Messung", der häufigsten
 * Aufgabe dieser Seite, und speicherten beim Verlassen bzw. nach 400 ms. Jetzt
 * stehen sie unter dem Verlauf zum Lesen; „Speichern" schreibt, „Abbrechen"
 * verwirft. Der Entwurf entsteht beim Klick auf „Bearbeiten" aus den
 * Serverwerten und gehört dann der Person.
 *
 * ⚠️ DER AUFRUFER SETZT `key={id}`: beim Wechsel auf eine ANDERE Flasche darf
 * kein offener Entwurf der vorigen stehen bleiben.
 */
export function ReferenzFelder({
  zusatz,
  ...start
}: ReferenzWerte & {
  /** Unter der Liste: Status und Löschen (IDA-239, vorher im Seitenkopf). */
  zusatz?: ReactNode;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState<ReferenzWerte>(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  function umschalten(an: boolean): void {
    setFehler(null);
    setEntwurf(start);
    setBearbeiten(an);
  }

  function aendern(aenderung: Partial<ReferenzWerte>): void {
    setEntwurf((vorher) => ({ ...vorher, ...aenderung }));
  }

  function speichern(): void {
    setFehler(null);
    starten(async () => {
      try {
        const ergebnis = await flascheSpeichern({
          id: entwurf.id,
          name: entwurf.name.trim(),
          lagerortId: entwurf.lagerortId,
          groesseLiter: entwurf.groesseLiter ?? undefined,
          nennfuelldruckBar: entwurf.nennfuelldruckBar,
          // Siehe den Hinweis am Typ: fehlt diese Zeile, faellt der Grenzwert bei
          // JEDEM Speichern still auf die Vorgabe zurueck.
          wechselAbProzent: entwurf.wechselAbProzent,
        });
        if (!ergebnis.ok) {
          // Der Satz aus der Action, nicht die Modulkonstante: nur er
          // unterscheidet „Lagerort nicht gefunden." von einem Schreibfehler
          // und sagt der Person, ob neu laden oder erneut versuchen hilft.
          setFehler(ergebnis.fehler);
          return;
        }
        setBearbeiten(false);
      } catch {
        setFehler(SPEICHER_FEHLER);
      }
    });
  }

  /* ⚠️ DIE BAR-ZAHL FOLGT BEIDEN FELDERN, nicht nur dem Prozentfeld: wer den
     Nennfuelldruck aendert, aendert mit, was derselbe Prozentwert in bar
     bedeutet. Und bar ist die Einheit, in der jemand spaeter am Manometer
     abliest — der Prozentwert allein ist dort nicht pruefbar. */
  const werte = bearbeiten ? entwurf : start;
  const grenzeBar = werte.nennfuelldruckBar > 0
    ? wechselGrenzeBar(werte.nennfuelldruckBar, werte.wechselAbProzent)
    : null;

  return (
    <Stammdaten
      bearbeiten={bearbeiten}
      onBearbeiten={umschalten}
      laeuft={laeuft}
      onSpeichern={speichern}
      fehler={fehler}
      zusatz={zusatz}
      hinweis={grenzeBar === null
        ? undefined
        : `Der Wechselhinweis erscheint ab ${grenzeBar} bar und darunter.`}
      felder={[
        { name: "Name", wert: start.name },
        { name: "Größe", wert: start.groesseLiter === null ? "–" : `${start.groesseLiter} l` },
        { name: "Nennfülldruck", wert: `${start.nennfuelldruckBar} bar` },
        { name: "Wechselhinweis ab", wert: `${start.wechselAbProzent} %` },
      ]}
      eingaben={(
        <>
          <StammdatenEingabe label="Name">
            <Input
              aria-label="Name"
              autoComplete="off"
              value={entwurf.name}
              onChange={(ereignis) => aendern({ name: ereignis.target.value })}
            />
          </StammdatenEingabe>
          <StammdatenEingabe label="Größe (l)">
            <InputNumber<number>
              min={1}
              precision={0}
              value={entwurf.groesseLiter}
              aria-label="Größe in Litern"
              onChange={(wert) => aendern({ groesseLiter: wert })}
              style={{ width: "100%" }}
            />
          </StammdatenEingabe>
          <StammdatenEingabe label="Nennfülldruck (bar)">
            <InputNumber<number>
              min={1}
              precision={0}
              value={entwurf.nennfuelldruckBar}
              aria-label="Nennfülldruck"
              onChange={(wert) => {
                if (wert !== null) aendern({ nennfuelldruckBar: wert });
              }}
              style={{ width: "100%" }}
            />
          </StammdatenEingabe>
          <StammdatenEingabe label="Wechselhinweis ab (%)">
            <InputNumber<number>
              min={O2_WECHSEL_MIN_PROZENT}
              max={O2_WECHSEL_MAX_PROZENT}
              precision={0}
              value={entwurf.wechselAbProzent}
              aria-label="Wechselhinweis ab Prozent vom Nennfülldruck"
              // ⚠️ `suffix`, NICHT `addonAfter`: das ist in antd 6 abgekündigt
              // (Doku: „please use Space.Compact instead"). Es geht durch den
              // Typecheck und meldet sich nur in der Konsole — dieselbe Klasse wie
              // `width` auf `Drawer` (Falle 13).
              suffix="%"
              onChange={(wert) => {
                if (wert !== null) aendern({ wechselAbProzent: wert });
              }}
              style={{ width: "100%" }}
            />
          </StammdatenEingabe>
        </>
      )}
    />
  );
}
