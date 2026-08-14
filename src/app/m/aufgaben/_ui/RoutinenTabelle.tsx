"use client";

import { Button, Table } from "antd";
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
 */
export function RoutinenTabelle({ routinen }: { routinen: RoutineRow[] }) {
  return (
    <Table<RoutineRow>
      rowKey="id"
      dataSource={routinen}
      pagination={false}
      // OHNE `scroll`, BRICHT DIE TABELLE AUF 390PX (Brief, Spec §9.5).
      scroll={{ x: "max-content" }}
      columns={[
        {
          // SPALTENKOEPFE UEBER `columns[].title`, NIE UEBER EINE CSS-REGEL GEGEN
          // `.ant-table-thead th` (Brief, Spec §9.5).
          title: "Titel",
          key: "titel",
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
          render: (_: unknown, routine: RoutineRow) => routine.uhrzeit ?? "ohne feste Zeit",
        },
        {
          title: "Dauer",
          key: "dauer",
          render: (_: unknown, routine: RoutineRow) => fmtDauer(routine.dauerMinuten),
        },
        {
          title: "Status",
          key: "status",
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
              <Button size="small" href={`/routinen?bearbeiten=${encodeURIComponent(routine.id)}`}>
                Ändern
              </Button>
              <form action={routineRuhenAction}>
                <input type="hidden" name="routineId" value={routine.id} />
                <Button size="small" htmlType="submit">
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
