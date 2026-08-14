"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import { einplanenAction } from "../actions";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import type { AufgabeRow } from "../_db/schema";
import { SPACE } from "@/core/theme/tokens";

/*
 * DIE GRUNDLAGE UNTER DEM ZIEHEN (Spec §8.5, Brief) — nicht das Provisorium bis Aufgabe 20 kommt,
 * sondern der Weg, der auf dem Handy, mit der Tastatur und mit einem Screenreader funktioniert.
 * Ziehen ist keines davon. Vorbild `RoutineFormular.tsx` (Aufgabe 11) — dieselbe Form:
 *
 *  1. `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR.
 *  2. KEIN antd-`Form`, KEIN `Form.Item` — die Meldung steht von Hand am Feld (`useActionState`).
 *     `Input` ist selbst KEIN Compound-Zugriff und in einer Client-Insel ohnehin erlaubt.
 *  3. KEIN `@ant-design/icons`. Diese Datei braucht ohnehin keine Zeichen.
 *  4. `values` TRAEGT JEDES GESENDETE FELD ZURUECK — `einplanenAction` (Aufgabe 10) tut das bereits
 *     fuer `planDatum`/`planUhrzeit`, diese Datei baut das nicht nach, sie liest nur `feldWert`.
 *
 * `einplanenAction` GIBT ES SEIT AUFGABE 10 — DIESE DATEI RUFT SIE NUR AUF, SIE BAUT SIE NICHT NEU
 * (Brief). Sie fragt `task.status` nirgends ab (das liegt vollstaendig in `uebergang()`), deshalb
 * unterscheidet auch dieses Formular die beiden zulaessigen Ausgangszustaende `verteilt`/`in_arbeit`
 * NICHT — es gibt keinen Sonderfall zu bauen, und `EinplanenFormular.test.tsx` haelt fest, dass beide
 * Zustaende identisches Markup ergeben.
 *
 * EINE UHRZEIT IST OPTIONAL UND BLEIBT ES (Brief, Spec §5.1): ein Eintrag ohne Uhrzeit ist kein
 * unfertiger Eintrag, sondern der Normalfall — er erbt den vorangehenden Anker (`_lib/tagesplan.ts`).
 * Das Feld traegt deshalb weder `required` noch sonst einen Zwang zu einer Uhrzeit, nur die
 * Beschriftung „(optional)" wie bei `RoutineFormular`s Uhrzeitfeld.
 *
 * DAUERSCHAETZUNG IST EIN VIERTES, ECHTES EINGABEFELD (Betreiberentscheidung nach Aufgabe 12, Fix-
 * Runde 1 — nicht mehr der reine Lesetext der ersten Fassung): das Tagesbudget im Wochenplan rechnet
 * mit `dauerMinuten`, und wer eine Aufgabe einplant, weiss oft besser als der Auftraggeber, wie lange
 * sie dauert — die urspruengliche Schaetzung ist eine Annahme, kein Faktum. `einplanenAction`
 * (`actions.ts`) traegt dafuer jetzt ein viertes Feld, mit derselben Zweiteilung wie `planUhrzeit`:
 * LEER laesst den bestehenden Wert unveraendert (die Spalte ist `NOT NULL` — „optional" heisst hier
 * NICHT „darf leer bleiben", jede Aufgabe hat immer schon eine gueltige Dauer), ein GESENDETER Wert
 * muss gueltig sein und wird bei einem Fehler in `values` zurueckgetragen (Lektion 3: `feldWert`
 * ignoriert im Fehlerzustand die Vorbelegung). Vorbelegt mit `task.dauerMinuten` — ein normales
 * Absenden traegt deshalb praktisch immer einen echten, gueltigen Wert.
 *
 * `idPrefix` (Aufgabe 13, Gegenprobe-Fund): `/plan/[personId]` rendert diese Datei einmal PRO
 * einzuplanender Aufgabe (`nochEinzuplanen.map(...)`). Mit dem alten festen Praefix `ep-` teilten
 * sich zwei oder mehr Formulare dieselben Feld-Ids — jedes `label[for]` zeigte auf das ERSTE
 * Formular, `aria-describedby` ebenso. Der Aufrufer reicht deshalb `task.id` ein (Default `"ep"`
 * haelt diese Datei UND `EinplanenFormular.test.tsx`, die den alten festen Praefix pruefen,
 * unveraendert lauffaehig).
 */
export function EinplanenFormular({
  task,
  idPrefix = "ep",
}: {
  task: AufgabeRow;
  idPrefix?: string;
}) {
  const [state, formAction, isPending] = useActionState(einplanenAction, FORM_START);

  const planDatumFehler = feldFehler(state, "planDatum");
  const planUhrzeitFehler = feldFehler(state, "planUhrzeit");
  const dauerFehler = feldFehler(state, "dauerMinuten");

  const idPlanDatum = `${idPrefix}-planDatum`;
  const idPlanUhrzeit = `${idPrefix}-planUhrzeit`;
  const idDauerMinuten = `${idPrefix}-dauerMinuten`;

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480 }}
    >
      <input type="hidden" name="aufgabeId" value={task.id} />

      <div>
        <label htmlFor={idPlanDatum} style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Tag
        </label>
        <Input
          id={idPlanDatum}
          name="planDatum"
          type="date"
          defaultValue={feldWert(state, "planDatum", task.planDatum ?? "")}
          status={planDatumFehler ? "error" : undefined}
          aria-invalid={planDatumFehler ? true : undefined}
          aria-describedby={planDatumFehler ? `${idPlanDatum}-err` : undefined}
        />
        {planDatumFehler ? (
          <p id={`${idPlanDatum}-err`} style={{ margin: `${SPACE.xs}px 0 0` }}>
            {planDatumFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={idPlanUhrzeit} style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Uhrzeit (optional)
        </label>
        <Input
          id={idPlanUhrzeit}
          name="planUhrzeit"
          type="time"
          defaultValue={feldWert(state, "planUhrzeit", task.planUhrzeit ?? "")}
          status={planUhrzeitFehler ? "error" : undefined}
          aria-invalid={planUhrzeitFehler ? true : undefined}
          aria-describedby={planUhrzeitFehler ? `${idPlanUhrzeit}-err` : undefined}
        />
        {planUhrzeitFehler ? (
          <p id={`${idPlanUhrzeit}-err`} style={{ margin: `${SPACE.xs}px 0 0` }}>
            {planUhrzeitFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={idDauerMinuten} style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Dauerschätzung in Minuten
        </label>
        <Input
          id={idDauerMinuten}
          name="dauerMinuten"
          type="number"
          min={1}
          defaultValue={feldWert(state, "dauerMinuten", task.dauerMinuten.toString())}
          status={dauerFehler ? "error" : undefined}
          aria-invalid={dauerFehler ? true : undefined}
          aria-describedby={dauerFehler ? `${idDauerMinuten}-err` : undefined}
        />
        {dauerFehler ? (
          <p id={`${idDauerMinuten}-err`} style={{ margin: `${SPACE.xs}px 0 0` }}>
            {dauerFehler}
          </p>
        ) : null}
      </div>

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        Einplanen
      </Button>
    </form>
  );
}
