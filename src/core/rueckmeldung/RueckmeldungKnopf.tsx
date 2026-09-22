"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Button } from "antd";
// Dieselbe Zeichenfamilie wie die Navigationseinträge (`navIkonen.tsx`) und das
// Avatar-Menü (`SuiteNav.tsx`) und NICHT `@ant-design/icons`: zwei
// Strichstärken nebeneinander sieht man, und der Knopf steht über Flächen, auf
// denen die Phosphor-Zeichen ohnehin schon stehen.
import { PiChatTeardropDots, PiX } from "react-icons/pi";

import {
  OFFEN,
  SERVER_STAND,
  abonniereRueckmeldung,
  liesRueckmeldungStand,
  merkeRueckmeldungErledigt,
} from "@/core/rueckmeldung/zustand";
import s from "./rueckmeldung.module.css";

/**
 * DER SCHWEBENDE RÜCKMELDEKNOPF — der dritte und auffälligste der drei Wege zum
 * Formular (DRK-453). Die anderen beiden sind der Eintrag im Avatar-Menü
 * (`SuiteNav`) und die Kachel im Portal; sie bleiben immer stehen. Dieser hier
 * ist der einzige, der sich selbst abschafft.
 *
 * ⚠️ ER GEHT NACH EINER BENUTZUNG WEG, UND ZWAR ENDGÜLTIG. Ein dauerhaft
 * schwebender Knopf ist auf einer Arbeitsfläche eine Zumutung — er steht über
 * dem Inhalt, klebt beim Scrollen mit und fragt jeden Tag dasselbe. Die
 * Antwort darauf ist nicht, ihn kleiner zu machen, sondern ihn genau einmal zu
 * zeigen. Was „einmal" heisst und warum das nicht „einmal abgeschickt" ist,
 * steht in `zustand.ts`.
 *
 * ⚠️ DAS SCHLIESSKREUZ IST KEIN SCHMUCK, SONDERN DIE ZWEITE HÄLFTE DES
 * VERSPRECHENS. Ohne es hätte nur den Knopf los, wer das Formular öffnet — also
 * genau der, der gar nichts sagen wollte, müsste erst so tun als ob. Beide
 * Klicks führen auf denselben Zustand, weil beide dasselbe heissen: dieser
 * Knopf hat seine Aufgabe erfüllt.
 *
 * ⚠️ `useSyncExternalStore` UND NICHT `useState` + `useEffect`. Der Stand steht
 * in `localStorage`, das es auf dem Server nicht gibt; das Effekt-Muster
 * erzeugt für denselben Ausgang einen zweiten Renderdurchlauf und verstösst
 * gegen `react-hooks/set-state-in-effect`. Dieser Hook ist Reacts eigene
 * Antwort auf „Server oder Client?" — dieselbe Bauform wie `montiert` in
 * `SuiteNav`. Der Server-Schnappschuss ist `ERLEDIGT`, der Knopf entsteht
 * serverseitig also gar nicht (Begründung in `zustand.ts`).
 *
 * ⚠️ `target="_blank"` UND `rel="noopener noreferrer"` GEHÖREN ZUSAMMEN. Das
 * Formular liegt bei einem fremden Anbieter; ohne `noopener` bekäme dessen
 * Seite über `window.opener` einen Griff auf das Fenster der Suite. Der neue
 * Tab ist hier ausserdem die freundlichere Wahl: wer mitten in einer Buchung
 * oder einer Inventur etwas melden will, verliert seine Fläche nicht.
 */
export function RueckmeldungKnopf({ url }: { url: string }) {
  const stand = useSyncExternalStore(
    abonniereRueckmeldung,
    liesRueckmeldungStand,
    () => SERVER_STAND,
  );

  /*
   * Ein Rückruf für beide Knöpfe. Am LINK hängt er zusätzlich zur Navigation:
   * `merkeRueckmeldungErledigt()` schreibt synchron in `localStorage`, der neue
   * Tab öffnet unabhängig davon — es gibt hier also nichts abzuwarten und
   * nichts zu verhindern (kein `preventDefault`, sonst führte der Link nirgends
   * mehr hin).
   */
  const erledigen = useCallback(() => merkeRueckmeldungErledigt(), []);

  /*
   * ⚠️ GEGEN `OFFEN` UND NICHT GEGEN `ERLEDIGT` — das ist die sichere
   * Richtung. Ein Stand, den diese Datei nicht kennt (ein von Hand verbogener
   * Eintrag, ein später ergänzter dritter Wert), bedeutet dann „kein Knopf"
   * statt „Knopf". Ein fehlender Knopf kostet eine Rückmeldung; ein Knopf, der
   * trotz Ausblenden wiederkommt, kostet das Vertrauen in den Ausblenden-Knopf.
   */
  if (stand !== OFFEN) return null;

  return (
    <div className={s.schweber} data-testid="rueckmeldung-schweber">
      <Button
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="rueckmeldung-knopf"
        icon={<PiChatTeardropDots aria-hidden="true" />}
        onClick={erledigen}
      >
        Feedback
      </Button>
      {/*
       * ⚠️ `aria-label` IST HIER PFLICHT, NICHT KÜR: der Knopf trägt nur ein
       * Zeichen, und ein Zeichen liest sich nicht vor. „Ausblenden" allein wäre
       * ebenfalls zu wenig — in einer Liste von Bedienelementen steht der
       * Eintrag ohne seinen Gegenstand da.
       */}
      <Button
        shape="circle"
        aria-label="Feedback-Knopf ausblenden"
        data-testid="rueckmeldung-ausblenden"
        icon={<PiX aria-hidden="true" />}
        onClick={erledigen}
      />
    </div>
  );
}
