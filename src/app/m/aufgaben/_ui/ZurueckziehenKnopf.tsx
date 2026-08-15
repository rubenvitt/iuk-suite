"use client";

import { useRef } from "react";
import { Button, Popconfirm } from "antd";
import { zurueckziehenAction } from "../actions";

/*
 * „ZURUECKZIEHEN" ALS EIGENE CLIENT-INSEL (Oberflaechen-Spec 2026-08-16 §6.7).
 *
 * WARUM SIE EINE EIGENE DATEI IST UND NICHT LAENGER PRIVAT IN `_ui/AktionsZone.tsx` STEHT: die
 * Fuehrungskarte des Auftraggebers (Rang 3, §4.2) braucht denselben Knopf, und
 * `_ui/Fuehrungskarte.tsx` ist eine SERVER COMPONENT. `Popconfirm` verlangt `onConfirm`, also eine
 * FUNKTION ALS PROP — aus einer Server Component heraus ist das exakt Falle 9 („Functions cannot
 * be passed directly to Client Components"). Kein Tor ausser einem echten Abruf sieht den Fehler:
 * `typecheck`, `lint`, `build` und Vitest bleiben alle gruen, die Seite antwortet mit HTTP 500.
 * Der Ausweg ist die direkt importierte Insel, die ihre Funktion SELBST definiert — Vorbild ist
 * genau diese Stelle, die `AktionsZone.tsx` seit Aufgabe 16 traegt.
 *
 * EINE FASSUNG, ZWEI AUFRUFER: `AktionsZone` importiert diese Datei jetzt ebenfalls, statt eine
 * zweite, zeichengleiche Fassung zu halten. Der Bestaetigungstext ist Spec §9.9 („zurueckziehen
 * ist bestaetigungspflichtig") und nennt die Folge woertlich — `zurueckziehenAction` LOESCHT die
 * Aufgabe samt Verlauf, danach antwortet `/a/<id>` fuer diese Id mit `notFound()`.
 *
 * ZURUECKZIEHEN IST NIE EIN PRIMAERKNOPF (§4.2 Auftrag Rang 3, §7 Nr. 2): ein destruktiver Knopf
 * als Primaeraktion einer Fuehrungskarte laedt zum Wegdruecken einer Aufgabe ein, die nur auf
 * Verteilung wartet. Deshalb steht hier kein `type="primary"`, sondern `danger` auf einem
 * Standardknopf — und deshalb steht `zurueckziehen` auch nicht in der Vorrangliste von §7 Nr. 2.
 */
export function ZurueckziehenKnopf({ aufgabeId }: { aufgabeId: string }) {
  const formular = useRef<HTMLFormElement>(null);
  return (
    <form action={zurueckziehenAction} ref={formular}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Popconfirm
        title="Aufgabe zurückziehen?"
        description="Die Aufgabe wird samt ihrem gesamten Verlauf gelöscht. Das lässt sich nicht rückgängig machen."
        okText="Zurückziehen"
        cancelText="Abbrechen"
        onConfirm={() => formular.current?.requestSubmit()}
      >
        <Button danger data-testid="zurueckziehen">
          Zurückziehen
        </Button>
      </Popconfirm>
    </form>
  );
}
