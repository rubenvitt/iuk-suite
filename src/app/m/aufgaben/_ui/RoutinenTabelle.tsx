"use client";

import { Button } from "antd";
import {
  Kartentabelle,
  nachJaNein,
  nachText,
  nachZahl,
  zustandsFilter,
} from "@/core/tabelle";
import { routineRuhenAction } from "../actions";
import { fmtDauer, fmtWochentage } from "../_lib/anzeige";
import type { RoutineRow } from "../_db/schema";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * DIE ROUTINEN-TABELLE — EINE ZWEITE CLIENT-INSEL, DIE DER BRIEF NICHT VORAUSGESEHEN HAT (Bericht
 * dokumentiert das ausfuehrlich als Widerspruch): `routinen/page.tsx` (Server Component) kann
 * `<Table>` NICHT direkt mit `columns[].render`-Funktionen im JSX aufrufen — antds `Table` ist selbst
 * eine Client-Komponente (intern "use client"), und eine in der Server Component gebaute
 * `render`-Closure ist eine PLAIN FUNCTION, keine Server-Action. React/Next lehnt das beim
 * ECHTEN Abruf ab: "Functions cannot be passed directly to Client Components" — genau der Fehler,
 * den `pnpm build` und Vitest strukturell nicht sehen (jsdom-Mounts in Vitest sind ein einziger
 * JS-Prozess ohne RSC-Serialisierungsgrenze), sondern nur ein echter Playwright-Abruf zeigt.
 *
 * DIE LOESUNG — Vorbild `lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx`: die Tabelle wandert
 * in eine EIGENE Client-Komponente, die nur SERIALISIERBARE Daten (`RoutineRow[]`, die die Server
 * Component gelesen hat) als Prop bekommt und ihre `render`-Funktionen SELBST definiert — sie
 * ueberqueren dann nie die Server/Client-Grenze, weil sie innerhalb derselben Client-Komponente
 * entstehen UND benutzt werden. `routineRuhenAction` bleibt die EINE Ausnahme von "keine Funktionen
 * ueber die Grenze": Server Actions SIND serialisierbar (das ist ihr ganzer Zweck) und werden hier
 * direkt importiert, nicht als Prop durchgereicht.
 *
 * SEIT DER UMSTELLUNG AUF `@/core/tabelle` STEHEN `pagination={false}` UND `scroll={{ x:
 * "max-content" }}` NICHT MEHR HIER — beides ist die Vorgabe der `Datentabelle`, und der
 * Spaltenkopf-Kicker kommt ebenfalls von dort (`title` ist deshalb eine nackte Zeichenkette).
 *
 * ⚠️ SORTIERT WIRD UEBER DEN ROHWERT, NIE UEBER DEN ANZEIGETEXT. `fmtDauer(15)` ist „15 Min.",
 * `fmtDauer(90)` ist „1:30 Std." — als Zeichenkette verglichen stuende die laengere Routine vor der
 * kuerzeren. Verglichen wird deshalb `dauerMinuten`; `uhrzeit` steht als „HH:MM" schon als Rohwert
 * in der Zeile und ordnet in dieser Form auch als Text richtig (nullgefuellt, feste Breite).
 *
 * ⛔ DIE WOCHENTAGE TRAGEN KEINEN `sorter`: `wochentage` ist eine Bitmaske, und ihre Zahlenordnung
 * („Mo,Mi" vor „Di") ist keine, die jemand erwartet. Die Aktionsspalte traegt keinen, weil in ihr
 * kein Wert steht.
 */
export function RoutinenTabelle({ routinen }: { routinen: RoutineRow[] }) {
  return (
    <Kartentabelle<RoutineRow>
      rowKey="id"
      aria-label="Routinen"
      dataSource={routinen}
      leer={{ nichts: "Noch keine Routinen angelegt.", gefiltert: "Keine Routine passt zum Filter." }}
      columns={[
        {
          // SPALTENKOEPFE UEBER `columns[].title`, NIE UEBER EINE CSS-REGEL GEGEN
          // `.ant-table-thead th` (Brief, Spec §9.5) — die Rolle setzt jetzt die
          // `Datentabelle`, der Text hier bleibt ein nackter String.
          title: "Titel",
          key: "titel",
          sorter: nachText<RoutineRow>((routine) => routine.titel),
          // `.routineZeile` (Vorbild `Wochenplan.tsx`s `EintragZeile`) markiert eine Routine AUCH
          // HIER durchgehend mit demselben Icon+Layout — dieselbe Sprache wie im Wochenplan.
          render: (_: unknown, routine: RoutineRow) => (
            <span className={s.routineZeile}>
              <Ikone name="routine" />
              <span>{routine.titel}</span>
            </span>
          ),
        },
        {
          title: "Wochentage",
          key: "wochentage",
          render: (_: unknown, routine: RoutineRow) => fmtWochentage(routine.wochentage),
        },
        {
          title: "Uhrzeit",
          key: "uhrzeit",
          // Routinen ohne feste Zeit tragen `null` und stehen aufsteigend hinten.
          sorter: nachText<RoutineRow>((routine) => routine.uhrzeit),
          render: (_: unknown, routine: RoutineRow) => routine.uhrzeit ?? "ohne feste Zeit",
        },
        {
          title: "Dauer",
          key: "dauer",
          sorter: nachZahl<RoutineRow>((routine) => routine.dauerMinuten),
          render: (_: unknown, routine: RoutineRow) => fmtDauer(routine.dauerMinuten),
        },
        {
          title: "Status",
          key: "status",
          /*
           * „Zeig mir die ruhenden" ist ein Praedikat ueber der Zeile, und ein Praedikat ueber der
           * Zeile ist ein Spaltenfilter — keine Knopfleiste ueber der Tabelle. `zustandsFilter`
           * und nicht `werteAlsFilter`: `aktiv` ist ein Wahrheitswert, die zwei Woerter daneben
           * sind Anzeige und stehen in keinem Feld.
           *
           * Sortiert wird ueber `aktiv` und NICHT ueber das Wort: „Aktiv" stuende alphabetisch vor
           * „Ruht", was hier zufaellig stimmt — bei einer Umbenennung waere es still falsch.
           * `nachJaNein` stellt `true` nach vorn, die laufenden Routinen also zuerst.
           */
          sorter: nachJaNein<RoutineRow>((routine) => routine.aktiv),
          ...zustandsFilter<RoutineRow>([
            { wert: "aktiv", text: "Aktiv", trifft: (routine) => routine.aktiv },
            { wert: "ruht", text: "Ruht", trifft: (routine) => !routine.aktiv },
          ]),
          // EINE RUHENDE ROUTINE IST SICHTBAR ALS SOLCHE MARKIERT (Brief) — sie verschwindet nicht,
          // sonst liesse sie sich nicht wieder aufwecken. Direkt ueber die generischen
          // `.chip`/`.tonOk`/`.tonGrau`-Klassen, nicht ueber `Chip.tsx`: der ist auf
          // `Status`/`Prioritaet` der Aufgabe typisiert, eine Routine kennt keinen der beiden.
          render: (_: unknown, routine: RoutineRow) => (
            <span className={`${s.chip} ${routine.aktiv ? s.tonOk : s.tonGrau}`}>
              {routine.aktiv ? "Aktiv" : "Ruht"}
            </span>
          ),
        },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, routine: RoutineRow) => (
            <div className={s.knopfzeile}>
              <Button href={`/routinen?bearbeiten=${encodeURIComponent(routine.id)}`}>
                Ändern
              </Button>
              <form action={routineRuhenAction}>
                <input type="hidden" name="routineId" value={routine.id} />
                <Button htmlType="submit">
                  {routine.aktiv ? "Ruhen lassen" : "Wieder aktivieren"}
                </Button>
              </form>
            </div>
          ),
        },
      ]}
    />
  );
}
