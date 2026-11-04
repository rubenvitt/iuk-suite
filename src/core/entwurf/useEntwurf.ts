"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { randomId } from "@/core/zufallsId";
import {
  deserialisiere, ladeEntwurf, loescheEntwurf, raeumeAuf, serialisiere, speichereEntwurf,
  type Sendung,
} from "./ablage";
import { istVeralteteAktion, wartezeit, type SendeZustand } from "./senden";

/**
 * EINGABEN, DIE NICHTS VERLIERT — IDA-358.
 *
 * Ein Formular reicht seinen Eingabestand herein; der Hook schreibt ihn bei jeder
 * Änderung auf das Gerät (`ablage.ts`), stellt ihn beim nächsten Aufbau derselben
 * Seite wieder her und hält eine Sendung fest, bis der Server sie BESTÄTIGT hat.
 * Gelöscht wird der Entwurf nur nach einer Antwort, die `antwort` als „fertig"
 * meldet — nie beim Absenden, nie bei einem Fehler.
 *
 * Der Hook besitzt den Zustand NICHT. Die Komponente behält ihre `useState`s und
 * reicht einen Schnappschuss (`stand`) und den Rückweg (`wiederherstellen`) — so
 * lässt sich ein bestehendes Formular anschließen, ohne seinen Zustand umzubauen.
 *
 * ⚠️ ZWEI ARTEN VON MISSERFOLG, und nur eine wird wiederholt:
 *   * `senden` WIRFT (Netz weg, 502/503/404 während eines Rollouts, Server Action
 *     nach neuem Build unbekannt): die Sendung bleibt stehen, der Hook versucht es
 *     erneut — mit wachsendem Abstand, sofort bei `online` und beim Zurückholen
 *     des Tabs.
 *   * `senden` ANTWORTET, und `antwort` meldet `false` (der Server hat abgelehnt):
 *     keine Wiederholung, die Eingaben bleiben, die Komponente zeigt den Grund.
 *
 * ⚠️ NACH EINEM ROLLOUT KANN EIN WIEDERHOLTER VERSUCH NIE GELINGEN: Next.js
 * vergibt die IDs der Server Actions je Build neu, die alte Seite ruft eine ID,
 * die der neue Server nicht kennt (`UnrecognizedActionError`). Dann lädt der Hook
 * die Seite neu — einmal je Sendung, die Sendung liegt da schon auf dem Gerät —,
 * und der Neuaufbau sendet sie mit den neuen IDs.
 *
 * ⚠️ DIE SENDUNGS-ID BLEIBT ÜBER ALLE VERSUCHE GLEICH. Kam ein Versuch an und nur
 * die Antwort ging verloren (Container mitten im Antworten beendet), sendet der
 * nächste Versuch dasselbe noch einmal. Wer `sendungId` serverseitig als
 * Wiederholungsschutz auswertet (Vorbild: `lagerbuch/_actions/check.ts`), bucht
 * dann nicht doppelt.
 */

export type { SendeZustand };

export type EntwurfOptionen<S, N, R> = {
  /** Eindeutig je Formular und Gegenstand, z. B. `lagerbuch:check:<fahrzeugId>:voll`. `null` = aus. */
  schluessel: string | null;
  /** Der aktuelle Eingabestand, JSON-fähig (dayjs und Date werden mitgenommen). */
  stand: S;
  wiederherstellen: (stand: S) => void;
  senden?: (nutzlast: N, sendungId: string) => Promise<R>;
  /** `true` = angekommen, der Entwurf wird gelöscht. `false` = abgelehnt, Eingaben bleiben. */
  antwort?: (ergebnis: R) => boolean;
  /** Nur für Tests: Ersatz für `location.reload()` (jsdom lässt es nicht ersetzen). */
  neuladen?: () => void;
};

export type Entwurf<N> = {
  /** Beim Aufbau lag ein Entwurf mit anderem Stand als dem leeren Formular. */
  wiederhergestellt: boolean;
  zustand: SendeZustand;
  /** Zeitpunkt (ms) des nächsten automatischen Versuchs, solange `zustand === "wartet"`. */
  naechsterVersuch: number | null;
  /** Speichert die Sendung auf dem Gerät und versucht sie sofort. */
  sende: (nutzlast: N) => void;
  /** Den wartenden Versuch vorziehen. */
  jetztSenden: () => void;
  /** Entwurf löschen und das Formular auf den Anfangsstand setzen. */
  verwerfen: () => void;
};

export function useEntwurf<S, N = unknown, R = unknown>(opt: EntwurfOptionen<S, N, R>): Entwurf<N> {
  const { schluessel } = opt;
  const text = serialisiere(opt.stand);

  // Der Stand des ersten Aufbaus ist „leer": gleicht der Entwurf ihm, gibt es keinen.
  const [anfang] = useState(text);
  const [wiederhergestellt, setWiederhergestellt] = useState(false);
  const [zustand, setZustand] = useState<SendeZustand>("ruhe");
  const [naechsterVersuch, setNaechsterVersuch] = useState<number | null>(null);

  const aktuell = useRef(opt);
  const sendung = useRef<Sendung | null>(null);
  const laeuft = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bereit = useRef(false);
  /*
   * ⚠️ DER ERSTE SPEICHERLAUF NACH DEM WIEDERHERSTELLEN SÄHE NOCH DEN LEEREN STAND.
   * Die Effekte eines Aufbaus laufen in einem Zug; der `setState` aus
   * `wiederherstellen` ist dann noch nicht gerendert. Ohne diese Sperre löschte
   * der Speicherlauf den eben gelesenen Entwurf wieder.
   */
  const wartetAufStand = useRef(false);
  const versuchRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    aktuell.current = opt;
  });

  const ablegen = useCallback((standText: string) => {
    const k = aktuell.current.schluessel;
    if (!k) return;
    if (standText === anfang && !sendung.current) {
      loescheEntwurf(k);
      return;
    }
    speichereEntwurf(k, {
      stand: deserialisiere(standText),
      geaendert: Date.now(),
      pfad: typeof location === "undefined" ? "" : location.pathname + location.search,
      sendung: sendung.current,
    });
  }, [anfang]);

  const standText = useRef(text);
  useLayoutEffect(() => {
    standText.current = text;
  }, [text]);

  const halteAn = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const versuch = useCallback(async () => {
    const s = sendung.current;
    const senden = aktuell.current.senden;
    if (laeuft.current || !s || !senden) return;
    laeuft.current = true;
    halteAn();
    setZustand("sendet");
    setNaechsterVersuch(null);
    s.versuche += 1;
    ablegen(standText.current);
    let ergebnis: unknown;
    try {
      ergebnis = await senden(s.nutzlast as N, s.id);
    } catch (fehler) {
      laeuft.current = false;
      const neuladen = aktuell.current.neuladen
        ?? (typeof location === "undefined" ? null : () => location.reload());
      if (istVeralteteAktion(fehler) && !s.neugeladen && neuladen) {
        s.neugeladen = true;
        ablegen(standText.current);
        neuladen();
        return;
      }
      const warte = wartezeit(s.versuche);
      setZustand("wartet");
      setNaechsterVersuch(Date.now() + warte);
      timer.current = setTimeout(() => versuchRef.current(), warte);
      return;
    }
    laeuft.current = false;
    sendung.current = null;
    setZustand("ruhe");
    const fertig = aktuell.current.antwort ? aktuell.current.antwort(ergebnis as R) : true;
    const k = aktuell.current.schluessel;
    if (fertig) {
      if (k) loescheEntwurf(k);
      setWiederhergestellt(false);
    } else {
      ablegen(standText.current);
    }
  }, [ablegen]);

  useLayoutEffect(() => {
    versuchRef.current = () => void versuch();
  }, [versuch]);

  // Aufbau: Entwurf lesen, wiederherstellen, eine liegende Sendung erneut versuchen.
  useEffect(() => {
    if (!schluessel) return;
    raeumeAuf();
    const e = ladeEntwurf<S>(schluessel);
    // Ein neuer Schlüssel erbt keine Sendung des vorigen (ein Dialog für mehrere Gegenstände).
    sendung.current = e?.sendung ?? null;
    if (e) {
      const gelesen = serialisiere(e.stand);
      if (gelesen !== anfang) {
        wartetAufStand.current = true;
        aktuell.current.wiederherstellen(e.stand);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Rückmeldung über einen Speicher außerhalb von React, einmal je Aufbau
        setWiederhergestellt(true);
      }
    }
    bereit.current = true;
    if (sendung.current) versuchRef.current();
    return () => {
      bereit.current = false;
      halteAn();
    };
  }, [schluessel, anfang]);

  // Jede Änderung sofort ablegen — `localStorage` ist synchron und billig.
  useEffect(() => {
    if (!schluessel || !bereit.current) return;
    if (wartetAufStand.current) {
      if (text === anfang) return;
      wartetAufStand.current = false;
    }
    ablegen(text);
  }, [schluessel, text, anfang, ablegen]);

  // Netz zurück oder Tab wieder vorn: den wartenden Versuch vorziehen.
  useEffect(() => {
    const vor = () => {
      if (sendung.current && !laeuft.current && document.visibilityState !== "hidden") versuchRef.current();
    };
    window.addEventListener("online", vor);
    document.addEventListener("visibilitychange", vor);
    return () => {
      window.removeEventListener("online", vor);
      document.removeEventListener("visibilitychange", vor);
    };
  }, []);

  const sende = useCallback((nutzlast: N) => {
    const s = sendung.current;
    sendung.current = s
      ? { ...s, nutzlast }
      : { id: randomId(), nutzlast, seit: Date.now(), versuche: 0 };
    ablegen(standText.current);
    versuchRef.current();
  }, [ablegen]);

  const jetztSenden = useCallback(() => versuchRef.current(), []);

  const verwerfen = useCallback(() => {
    halteAn();
    sendung.current = null;
    const k = aktuell.current.schluessel;
    if (k) loescheEntwurf(k);
    setWiederhergestellt(false);
    setZustand("ruhe");
    setNaechsterVersuch(null);
    aktuell.current.wiederherstellen(deserialisiere<S>(anfang));
  }, [anfang]);

  return { wiederhergestellt, zustand, naechsterVersuch, sende, jetztSenden, verwerfen };
}
