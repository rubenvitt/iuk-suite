import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Breadcrumb, Button, Card, Col, Row, Statistic } from "antd";
import { getDb } from "../../../_db/client";
import { getGroup, listResponses } from "../../../_db/queries";
import type { SurveyRow } from "../../../_db/schema";
import { guardPage } from "../../../_lib/guardPage";
import { cockpitZustand } from "../../../_lib/cockpit";
import { computeDAStats } from "../../../_lib/aggregation";
import { DEFAULT_CLOSE_AFTER_HOURS } from "../../../_lib/lifecycle";
import { buildToken } from "../../../_lib/token";
import type { Question } from "../../../_lib/questions";
import { T } from "../../../_ui/typo";
import { formatDatumKurz, heuteInZone } from "../../../_ui/datum";
import { NOTEN_WORT, ampelStufe, formatiereNote } from "../../../_lib/noten";
import { Notenpille } from "../../../_ui/Noten";
import { Lagekarte } from "../../../_ui/Lagekarte";
import { Teilnahme, teilnahmeUrlAus } from "../../../_ui/Teilnahme";

/**
 * DAS COCKPIT (Entwurf §2.1). Die einzige Arbeitsseite des Moduls.
 *
 * Server Component: kein Compound-Zugriff auf antd (§4.13 — `Typography.*`,
 * `Card.Meta`, `Breadcrumb.Item` … ergeben HTTP 500, den `pnpm build` nicht
 * sieht), `Breadcrumb` deshalb über `items`, Überschriften nativ mit `T.*`.
 *
 * Der Zustand wird EINMAL entschieden (`cockpitZustand`) und dann nur noch
 * dargestellt. Die Reihenfolge im DOM ist in jedem Zustand dieselbe: Kopfzone,
 * dann links „Letzter Abend" → Lagekarte, rechts die Teilnahme-Zone. In der
 * Betriebsart „Einrichtung" (kein Dienstabend) ist die Seite schmaler und
 * einspaltig, und der Verlauf entfällt vollständig — ein leeres Fach ist
 * schlimmer als kein Fach (§4.3).
 */
export default async function Cockpit({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);
  // Guard zuerst, mit derselben `id`, die anschließend lädt: kein Auseinanderlaufen
  // zwischen geprüftem und geladenem Schlüssel.
  const { db } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();

  const jetzt = new Date();
  const zustand = cockpitZustand(db, id, jetzt);
  const stunden = group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
  const einrichtung = zustand.modus === "einrichtung";
  /**
   * Freitextzählung für den Zwischenstand der Lagekarte (§2.3: „5 Freitexte — in
   * der Auswertung nachlesen"). Gerechnet HIER, mit `computeDAStats` — derselben
   * EINEN Aggregationsstelle, die auch „Letzter Abend" liest. Eine zweite
   * Zählschleife wäre eine zweite Wahrheit über denselben Datensatz.
   */
  const laufendeFreitexte = zustand.laufend
    ? zaehleFreitexte(abendStats(db, zustand.laufend.survey))
    : 0;

  /**
   * DIE KONTEXTZEILE DER KOPFZONE (§4.2). Gezählt werden ALLE Dienstabende
   * (auch der laufende — er ist erfasst), gemittelt nur die ABGESCHLOSSENEN:
   * `zustand.verlauf` schließt die laufende Umfrage aus (§2.2), und eine
   * vorläufige Zahl gehört in den Zwischenstand der Lagekarte, nicht in die
   * Kopfzeile, die den Stand der Gruppe zusammenfasst.
   *
   * `slice` VOR der Aggregation: so kostet die Zeile höchstens sechs Abfragen,
   * unabhängig davon, wie viele Jahre die Gruppe schon läuft.
   */
  const abendZahl = zustand.verlauf.length + (zustand.laufend ? 1 : 0);
  const letzteNoten = zustand.verlauf
    .slice(0, OE_FENSTER)
    .map((abend) => (abend.survey ? abendStats(db, abend.survey).avgSchulnote : null));

  /**
   * DIE TEILNAHME-ADRESSE — GENAU EINMAL hergeleitet und dann an BEIDE
   * Verbraucher gegeben: Zone a zeigt sie, der Lagekarten-Knopf zeigt sie groß.
   * Zwei Herleitungen wären zwei Adressen, und eine davon steht dann gedruckt an
   * der Wand. Der Host kommt aus den Headern (Vorrang `x-forwarded-host`, Regel
   * aus `core/routing.resolveHost`) — nie aus einer Anfrage-URL, die nach dem
   * Host-Rewrite der Middleware auf die interne Adresse zeigt. Begründung
   * vollständig in `_ui/Teilnahme.tsx`.
   */
  const teilnahmeUrl = teilnahmeUrlAus(await headers(), buildToken(group.slug, group.secret));

  return (
    <div
      style={{
        maxWidth: einrichtung ? 760 : 1120,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Breadcrumb
          style={T.meta}
          items={[
            { title: <Link href="/m/feedback">Feedback</Link> },
            { title: group.name },
          ]}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1 style={{ ...T.h1, margin: 0, textWrap: "balance" }}>{group.name}</h1>
        </div>
        <p style={{ ...T.meta, margin: 0 }}>{kontextzeile(abendZahl, letzteNoten)}</p>
      </header>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={einrichtung ? 24 : 15}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {zustand.letzterAbend && (
              <LetzterAbend groupId={id} lage={zustand.letzterAbend} db={db} />
            )}
            <Lagekarte
              groupId={id}
              zustand={zustand}
              jetzt={jetzt}
              stunden={stunden}
              heute={heuteInZone(jetzt)}
              freitexte={laufendeFreitexte}
              teilnahmeUrl={teilnahmeUrl}
              gruppenname={group.name}
            />
          </div>
        </Col>
        {/*
         * Rechte Spalte: die Teilnahme-Zone (QR, Link, Aushang). Sie hängt an der
         * GRUPPE, nicht an der Umfrage, und steht deshalb in JEDER Belegung —
         * auch in der Betriebsart „Einrichtung", wo sie einspaltig unter die
         * Lagekarte rutscht (§2.1: „Die Reihenfolge bleibt Lagekarte →
         * Teilnahme"). Genau dort trägt sie ihre einzige Variante: „Du kannst den
         * Aushang schon vor dem ersten Abend drucken." Würde die Spalte in der
         * Einrichtung entfallen, wäre dieser Satz unerreichbar.
         *
         * `fb-sticky` klebt erst ab `lg` (Klasse, nicht inline — §2.1).
         */}
        <Col xs={24} lg={einrichtung ? 24 : 9} style={{ alignSelf: "flex-start" }}>
          <div className={einrichtung ? undefined : "fb-sticky"}>
            <Teilnahme
              url={teilnahmeUrl}
              token={buildToken(group.slug, group.secret)}
              groupId={id}
              erststart={zustand.belegung === "A"}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}

/**
 * Das Fenster des Ø aus §4.2: „Ø der letzten sechs". Sechs Dienstabende sind
 * etwa ein Halbjahr — lang genug, dass ein einzelner schlechter Abend die Zeile
 * nicht kippt, kurz genug, dass sie noch von HEUTE spricht.
 */
export const OE_FENSTER = 6;

/**
 * DIE KONTEXTZEILE DER KOPFZONE (§4.2, Zeile 3): „14 Dienstabende erfasst · Ø
 * der letzten sechs: 2,1 gut" — leer: „Noch kein Dienstabend erfasst."
 *
 * Rein und exportiert, weil an ihr drei Zusagen hängen, die im Markup nicht
 * sichtbar sind:
 *
 * 1. **Der Halbsatz entfällt, wenn es keine Note gibt** — statt „Ø: —". Ein
 *    Abend ohne beantwortete Schulnoten-Frage hat `avgSchulnote === null`
 *    (§4.12), und aus `null` wird hier nie eine 0: der Mittelwert würde sonst
 *    mit jedem Freitext-Abend besser aussehen.
 * 2. **„sechs" wird nicht behauptet, wenn es weniger sind.** Bei vollem Fenster
 *    steht die Formulierung des Entwurfs wortgenau, darunter „Ø aus 2 Abenden" —
 *    dieselbe Haltung wie der nie erfundene Nenner der Lagekarte (§2.3).
 * 3. **Ziffer UND Wort** (§4.14: Farbe ist der letzte Kanal). Beide kommen aus
 *    `_lib/noten.ts`, damit die Zeile dieselbe Rampe und dieselbe Rundung nutzt
 *    wie Pille, Plakette und Spur — eine handgeschriebene „2,1 gut" wäre eine
 *    zweite Schwellentabelle.
 *
 * `notenJuengsteZuerst` ist die Reihenfolge von `zustand.verlauf` (Datum
 * absteigend); geschnitten wird VOR dem Filtern, sonst wären es „die letzten
 * sechs MIT Note" und damit ein anderes Fenster als das versprochene.
 */
export function kontextzeile(abende: number, notenJuengsteZuerst: (number | null)[]): string {
  if (abende === 0) return "Noch kein Dienstabend erfasst.";
  const kopf = `${abende} Dienstabende erfasst`;

  const noten = notenJuengsteZuerst
    .slice(0, OE_FENSTER)
    .filter((n): n is number => n !== null && Number.isFinite(n));
  if (noten.length === 0) return kopf;

  const mittel = noten.reduce((summe, n) => summe + n, 0) / noten.length;
  const fenster =
    noten.length === OE_FENSTER
      ? "der letzten sechs"
      : `aus ${noten.length} ${noten.length === 1 ? "Abend" : "Abenden"}`;
  return `${kopf} · Ø ${fenster}: ${formatiereNote(mittel)} ${NOTEN_WORT[ampelStufe(mittel) - 1]}`;
}

/**
 * Kennzahlen EINES Abends. Beide Leser der Seite („Letzter Abend" und der
 * Zwischenstand der Lagekarte) gehen durch diese Funktion, damit es genau einen
 * Weg von den Rohantworten zu Zahlen gibt.
 */
function abendStats(db: ReturnType<typeof getDb>, survey: SurveyRow) {
  const questions: Question[] = JSON.parse(survey.questions);
  const antworten = listResponses(db, survey.id).map(
    (r) => JSON.parse(r.answers) as Record<string, unknown>,
  );
  // `avgSchulnote`, NICHT `overallAvg`: eine 1–5-Altbestandsfrage darf nicht auf
  // die Sechser-Rampe abgetastet werden (§4.12).
  return computeDAStats(questions, antworten);
}

/** Freitext-ANTWORTEN, nicht Freitext-FRAGEN: die Karte nennt „5 Freitexte". */
const zaehleFreitexte = (stats: ReturnType<typeof abendStats>) =>
  stats.texts.reduce((summe, frage) => summe + frage.values.length, 0);

/**
 * SLOT „LETZTER ABEND" (§2.7). Beantwortet „habe ich das schon gelesen?" ohne
 * Klick — und zwar AUCH, während eine Umfrage läuft. Bewusst kein Primärknopf:
 * der Primärknopf der Seite ist immer die Zustandsaktion.
 */
function LetzterAbend({
  groupId,
  lage,
  db,
}: {
  groupId: number;
  lage: NonNullable<ReturnType<typeof cockpitZustand>["letzterAbend"]>;
  db: ReturnType<typeof getDb>;
}) {
  const stats = abendStats(db, lage.survey!);

  return (
    <Card
      variant="outlined"
      title="LETZTER ABEND"
      styles={{
        header: {
          ...T.kicker,
          minHeight: 40,
          paddingInline: 20,
          borderBottomColor: "var(--fb-split)",
        },
        // Polster als Variable, damit 390px 16 bekommt (§2.1) — `styles.body`
        // ist inline und liesse sich von keiner Klasse überstimmen.
        body: { padding: "var(--fb-kartenpolster)" },
      }}
    >
      <p style={{ ...T.body, margin: "0 0 12px" }}>
        {formatDatumKurz(lage.evening.date)}
        {lage.evening.topic ? ` · ${lage.evening.topic}` : ""}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Statistic
          value={lage.responseCount}
          valueStyle={T.h2}
          suffix={<span style={{ ...T.body, color: "var(--fb-muted)" }}>Rückmeldungen</span>}
        />
        <Notenpille note={stats.avgSchulnote} />
        {/*
         * §2.7: ein `Button` in `default` — „bewusst kein Primärknopf" meint die
         * STUFE, nicht die Bauform: der Primärknopf der Seite ist immer die
         * Zustandsaktion der Lagekarte. Ein nackter Textlink neben Zahl und
         * Notenpille ist kein erkennbares Ziel.
         *
         * `href` statt `<Link>` um den Knopf: antd rendert daraus EIN `<a>` —
         * ein Tabstop, ein Fokusring (§4.14), und der Weg zur Auswertung
         * funktioniert ohne JavaScript. `<Link><Button>` wäre `<a><button>`,
         * also verschachtelt Interaktives, und `fb-fokus` würde einen zweiten
         * Ring über antds eigenen legen.
         */}
        <Button href={`/m/feedback/groups/${groupId}/evenings/${lage.evening.id}/auswertung`}>
          Auswertung ansehen
        </Button>
      </div>
    </Card>
  );
}
