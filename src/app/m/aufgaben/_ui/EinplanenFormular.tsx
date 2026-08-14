"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import { einplanenAction } from "../actions";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { fmtDauer } from "../_lib/anzeige";
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
 * DAUERSCHAETZUNG STEHT NUR LESEND DA, KEIN EINGABEFELD (Widerspruch, an den Controller gemeldet,
 * siehe Bericht): Brief und Spec §8.5 zaehlen „Dauerschätzung" wortgleich als drittes FELD des
 * kleinen Formulars auf, neben Tag und Uhrzeit. `einplanenAction` (Aufgabe 10, „du rufst sie, du
 * baust sie nicht neu") liest und schreibt aber ausschliesslich `planDatum`/`planUhrzeit` — kein
 * `dauerMinuten`. Ein drittes, ECHTES Eingabefeld haette drei Folgen, von denen keine tragbar ist:
 * (a) die Action muesste erweitert werden, entgegen der ausdruecklichen Anweisung dieser Aufgabe; (b)
 * ein gesendetes, aber von der Action ignoriertes Feld waere GENAU der Fehler aus Lektion 3 dieser
 * Aufgabenreihe — `einplanenAction` echot es nicht in `values`, ein Feldfehler liesse die Eingabe
 * verschwinden, statt sie zurueckzutragen; (c) die rund zehn bestehenden `einplanenAction`-Tests
 * (Aufgabe 10) senden nur `planDatum`/`planUhrzeit` und wuerden bei einer PFLICHT-Dauer alle rot.
 * Deshalb: `fmtDauer(task.dauerMinuten)` als reiner Lesetext, ohne `name`-Attribut — die Zusage aus
 * Spec §8.2 ("zeigt daneben die Wochenauslastung ... damit der Vorschlag nicht ins Leere geht") ist
 * das naechste Vorbild dafuer, dass ein Kontextwert im selben Dialog stehen darf, ohne ein
 * Formularfeld zu sein. Wer die Dauerschaetzung beim Einplanen tatsaechlich AENDERBAR haben will,
 * muss `einplanenAction` um ein viertes, mit `istGueltigeDauerMinuten` geprueftes und in `values`
 * echotes Feld erweitern — das ist eine Brief-Korrektur, keine, die diese Aufgabe still vornimmt.
 */
export function EinplanenFormular({ task }: { task: AufgabeRow }) {
  const [state, formAction, isPending] = useActionState(einplanenAction, FORM_START);

  const planDatumFehler = feldFehler(state, "planDatum");
  const planUhrzeitFehler = feldFehler(state, "planUhrzeit");

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: 480 }}
    >
      <input type="hidden" name="aufgabeId" value={task.id} />

      <p style={{ margin: 0 }}>Dauerschätzung: {fmtDauer(task.dauerMinuten)}</p>

      <div>
        <label htmlFor="ep-planDatum" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Tag
        </label>
        <Input
          id="ep-planDatum"
          name="planDatum"
          type="date"
          defaultValue={feldWert(state, "planDatum", task.planDatum ?? "")}
          status={planDatumFehler ? "error" : undefined}
          aria-invalid={planDatumFehler ? true : undefined}
          aria-describedby={planDatumFehler ? "ep-planDatum-err" : undefined}
        />
        {planDatumFehler ? (
          <p id="ep-planDatum-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {planDatumFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="ep-planUhrzeit" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Uhrzeit (optional)
        </label>
        <Input
          id="ep-planUhrzeit"
          name="planUhrzeit"
          type="time"
          defaultValue={feldWert(state, "planUhrzeit", task.planUhrzeit ?? "")}
          status={planUhrzeitFehler ? "error" : undefined}
          aria-invalid={planUhrzeitFehler ? true : undefined}
          aria-describedby={planUhrzeitFehler ? "ep-planUhrzeit-err" : undefined}
        />
        {planUhrzeitFehler ? (
          <p id="ep-planUhrzeit-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {planUhrzeitFehler}
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
