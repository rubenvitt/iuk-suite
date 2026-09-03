import { notFound } from "next/navigation";
import { Alert, Button, Card, Statistic } from "antd";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { aktiveLernsets, idsAusSet, lernUebersicht } from "../../_db/lernen";
import { VORBEHALT } from "../../_lib/vorbehalt";
import s from "../../_ui/zeichen.module.css";

/*
 * ⛔ EINE SERVER COMPONENT. `Card`, `Statistic` und `Alert` sind sichere Direktexporte
 * (Falle 1); `Typography.Title`/`Descriptions.Item`/`Form.Item` waeren HTTP 500. Kein
 * `@ant-design/icons` (Falle 7). Die vier Zahlen kommen aus einer Server-Abfrage
 * (`lernUebersicht`) — die Quiz-Insel gibt es auf DIESER Seite nicht, sie lebt erst auf
 * `/lernen/runde`.
 *
 * `force-dynamic`, WEIL DIE SEITE DIE SITZUNG UND DEN LERNSTAND LIEST: eine
 * vorgerenderte Fassung zeigte allen dieselben Zahlen. Vorbild `(shell)/page.tsx`.
 */
export const dynamic = "force-dynamic";

export default async function LernenSeite(props: { searchParams: Promise<{ set?: string }> }) {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const { set } = await props.searchParams;
  const db = getDb();
  const sets = aktiveLernsets(db);
  const gewaehlt = set && sets.some((x) => x.slug === set) ? set : undefined;
  const heute = new Date().toISOString().slice(0, 10);
  const u = lernUebersicht(db, sub, heute, gewaehlt ? idsAusSet(db, gewaehlt) : undefined);

  return (
    <div className={s.modul}>
      <Seitenkopf titel="Üben" beschreibung="Fragen zu Zeichen und Bedeutungen, in Stufen wiederholt." />

      {/* ⚠️ DASS DIESER KASTEN DASTEHT, IST KEINE OPTION (Spec §5.6): das fachliche
          Review des Katalogs ist bei 544 von 544 Zeilen offen. `type="warning"`, NIE
          `type="error"`, ,weil colorError die Markenfarbe ist (Falle 3). Der Wortlaut
          kommt aus `_lib/vorbehalt.ts` und wird nicht abgeschrieben — derselbe Kasten
          steht auf der Modul-Startseite. */}
      <Alert
        type="warning"
        showIcon
        title={<span data-testid="zeichen-vorbehalt">{VORBEHALT.titel}</span>}
        description={VORBEHALT.text}
        style={{ marginBlockEnd: SPACE.lg }}
      />

      {sets.length > 0 && (
        <form method="get" style={{ marginBlockEnd: SPACE.lg }}>
          <label htmlFor="tz-lernen-set">Wobei möchtest du üben?</label>
          <br />
          {/* Die Wahl steht in der URL, nicht in der Datenbank — sie ist eine Ansicht,
              kein Zustand. */}
          <select
            id="tz-lernen-set"
            name="set"
            defaultValue={gewaehlt ?? ""}
            data-testid="lernen-set"
            className={s.eingabe}
            style={{ marginInlineEnd: 8, marginBlockStart: 4 }}
          >
            <option value="">Alle Zeichen</option>
            {sets.map((x) => (
              <option key={x.slug} value={x.slug} disabled={x.verfuegbar < 4}>
                {x.titel} (
                {x.verfuegbar === x.groesse
                  ? `${x.groesse} Zeichen`
                  : `${x.verfuegbar} von ${x.groesse} verfügbar`}
                ){x.verfuegbar < 4 ? " — zu wenige für eine Runde" : ""}
              </option>
            ))}
          </select>
          <Button htmlType="submit">Übernehmen</Button>
        </form>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: SPACE.md,
        }}
      >
        <Card>
          <Statistic title="Gefestigt" value={u.gefestigt} />
        </Card>
        <Card>
          <Statistic title="In Arbeit" value={u.inArbeit} />
        </Card>
        <Card>
          <Statistic title="Heute fällig" value={u.faellig} />
        </Card>
        <Card>
          <Statistic title="Noch nie gefragt" value={u.nieGefragt} />
        </Card>
      </div>
      <p data-testid="lernen-gesamt" style={{ marginBlockStart: SPACE.md }}>
        {u.gesamt} Zeichen{gewaehlt ? " in diesem Lernset" : ""}.
      </p>

      <Button
        type="primary"
        href={`/m/zeichen/lernen/runde${gewaehlt ? `?set=${gewaehlt}` : ""}`}
        data-testid="lernen-start"
        style={{ marginBlockStart: SPACE.sm }}
      >
        Losüben
      </Button>
    </div>
  );
}
