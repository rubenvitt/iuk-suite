import type { CSSProperties } from "react";
import { Card, Progress, Statistic } from "antd";
import type { CockpitZustand, LaufendeLage } from "../_lib/cockpit";
import { T } from "./typo";
import { formatDatumKurz, formatUhrzeit, formatWochentagZeit, formatZeitpunkt } from "./datum";
import { StartFormular } from "./StartFormular";
import { BeendenKnopf } from "./BeendenKnopf";

/**
 * DIE LAGEKARTE (Entwurf §2.3).
 *
 * Der einzige Platz der Seite, der seinen Inhalt wechselt: entweder das
 * Startformular oder die laufende Umfrage — nie beides, nie keins. Dadurch muss
 * der Nutzer nicht wissen, WO der Zustand steht, sondern nur lesen, WAS dort
 * steht. Welche der Belegungen gilt, ist hier schon entschieden
 * (`_lib/cockpit.ts`): in dieser Datei steht keine Zustandslogik, nur die
 * Darstellung einer bereits gefallenen Entscheidung.
 *
 * SERVER COMPONENT. Deshalb: kein Compound-Zugriff auf antd (`Typography.*`,
 * `Card.Meta`, … ergeben HTTP 500, den `pnpm build` nicht sieht), keine
 * Funktions-Props (`Statistic.formatter`, `Progress.format`), Kartentitel immer
 * ein String. Alles Interaktive liegt in `StartFormular` und `BeendenKnopf`.
 *
 * FARBE: die getönte Fläche in C/D ist `--fb-tint`, der Rücklaufbalken trägt
 * `--fb-ink` auf `--fb-fill`. antds Vorgabe für `Progress` wäre `colorPrimary`,
 * und das ist in diesem Projekt DRK-Rot — ein roter Rücklaufbalken liest sich als
 * Alarm, und Rot gehört im Modul `feedback` nie auf eine Datenfläche (§4.9).
 */

const KARTE = {
  header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
  body: { padding: 20 },
} satisfies Record<string, CSSProperties>;

/**
 * Getönte Karte: „hier passiert gerade etwas" als Flächenaussage (§2.3) — die
 * einzige getönte Fläche der Seite. Kein `header`-Eintrag, weil die laufende
 * Karte keinen Titel trägt: der Kicker steht im Rumpf, damit der pulsende Punkt
 * ein Element sein darf (ein Kartentitel ist immer ein String, §2.1).
 */
const KARTE_LAUFEND = {
  body: { ...KARTE.body, background: "var(--fb-tint)" },
} satisfies Record<string, CSSProperties>;

const HAARLINIE: CSSProperties = {
  border: 0,
  borderTop: "1px solid var(--fb-split)",
  margin: "16px 0",
};

export type LagekarteProps = {
  groupId: number;
  zustand: CockpitZustand;
  /** Zeitpunkt des Renderns — die Fußzeile „Stand: 21:47" hängt daran (§4.5). */
  jetzt: Date;
  /** `group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS` für die Fristvorschau. */
  stunden: number;
  /** Heute in `Europe/Berlin` (`YYYY-MM-DD`) — Vorbelegung des Datumsfelds. */
  heute: string;
};

export function Lagekarte({ groupId, zustand, jetzt, stunden, heute }: LagekarteProps) {
  const { belegung, laufend, weitereAktive } = zustand;

  return (
    <>
      {laufend ? (
        <LaufendeKarte
          laufend={laufend}
          jetzt={jetzt}
          nullAntworten={belegung === "C"}
        />
      ) : (
        <StartKarte
          groupId={groupId}
          erststart={belegung === "A"}
          heute={heute}
          stunden={stunden}
          teilnehmerVorbelegung={zustand.letzteTeilnehmerzahl}
        />
      )}

      {/*
       * Zwei aktive Umfragen sind ein Datenfehler (möglich, weil
       * `setSurveyStatus` keinen Übergangs-Check hat). Sie dürfen aber keinen
       * undefinierten Zustand auf der einzigen Arbeitsseite ergeben: neutrale
       * Zeile, benannter Ausweg — kein Alarm (§2.2).
       */}
      {weitereAktive.map((weitere) => (
        <p
          key={weitere.survey.id}
          style={{ ...T.meta, display: "flex", alignItems: "center", gap: 8, margin: 0 }}
        >
          Eine weitere Umfrage ist aktiv: {formatDatumKurz(weitere.evening.date)} —
          <BeendenKnopf surveyId={weitere.survey.id} beschriftung="beenden" darstellung="text" />
        </p>
      ))}

      {/*
       * Der Slot „nächster Dienstabend" (§2.3) steht nur bei laufender Umfrage und
       * ist zu: er darf die laufende Umfrage nicht überdecken.
       */}
      {laufend && (
        <StartFormular
          groupId={groupId}
          heute={heute}
          teilnehmerVorbelegung={laufend.evening.participantCount}
          stunden={stunden}
          variante="naechster"
        />
      )}
    </>
  );
}

/** Belegung A/B — die Karte IST das Startformular. */
function StartKarte({
  groupId,
  erststart,
  heute,
  stunden,
  teilnehmerVorbelegung,
}: {
  groupId: number;
  erststart: boolean;
  heute: string;
  stunden: number;
  teilnehmerVorbelegung: number | null;
}) {
  return (
    <Card
      variant="outlined"
      styles={KARTE}
      title={erststart ? "ERSTER SCHRITT" : "NÄCHSTER SCHRITT"}
      extra={<span style={T.meta}>Gerade läuft kein Feedback.</span>}
    >
      {erststart && (
        <p style={{ ...T.body, margin: "0 0 12px" }}>
          Schritt 1: unten das erste Feedback starten. Schritt 2: den Aushang aufhängen — der Code
          gilt dauerhaft.
        </p>
      )}
      <h2 style={{ ...T.h2, margin: "0 0 16px" }}>
        {erststart
          ? "Ersten Dienstabend anlegen und Feedback starten"
          : "Feedback für heute starten"}
      </h2>
      <StartFormular
        groupId={groupId}
        heute={heute}
        teilnehmerVorbelegung={teilnehmerVorbelegung}
        stunden={stunden}
      />
    </Card>
  );
}

/** Belegung C/D — die Karte IST die laufende Umfrage. */
function LaufendeKarte({
  laufend,
  jetzt,
  nullAntworten,
}: {
  laufend: LaufendeLage;
  jetzt: Date;
  nullAntworten: boolean;
}) {
  const { evening, survey, responseCount } = laufend;
  /**
   * EIN Prädikat für „es gibt einen Nenner". Absichtlich schließt es die 0 mit
   * ein: `participantCount = 0` ist über das Formular erreichbar, und „12 von 0"
   * wäre genau der erfundene Nenner, den §2.3 verbietet — inklusive der Division,
   * die daraus einen Prozentwert machen wollte.
   */
  const teilnehmer = evening.participantCount;
  const nenner = teilnehmer !== null && teilnehmer > 0 ? teilnehmer : null;
  // Gekappt, nie über 100 %: mehr Rückmeldungen als erfasste Teilnehmer ist ein
  // Alltagsfall (Gäste), kein Fehler — der Balken bleibt voll, der Satz erklärt.
  const quote = nenner === null ? null : Math.min(100, Math.round((responseCount / nenner) * 100));
  const ueberzaehlig = nenner !== null && responseCount > nenner;

  return (
    <Card variant="outlined" styles={KARTE_LAUFEND} style={{ background: "var(--fb-tint)" }}>
      <p style={{ ...T.kicker, display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
        <span
          className="fb-puls"
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--fb-ink)",
            flex: "0 0 auto",
          }}
        />
        {survey.activatedAt
          ? `LÄUFT SEIT ${formatWochentagZeit(survey.activatedAt)}`
          : "LÄUFT GERADE"}
      </p>
      <h2 style={{ ...T.h2, margin: "8px 0 16px" }}>
        {evening.topic ? `${evening.topic} · ` : ""}
        {formatDatumKurz(evening.date)}
      </h2>

      {nullAntworten ? (
        <p style={{ ...T.body, margin: 0 }}>
          Noch keine Rückmeldung — zeig den QR-Code am Ende des Abends.
        </p>
      ) : (
        <div>
          <Statistic
            value={responseCount}
            valueStyle={T.zahl}
            suffix={
              nenner !== null ? (
                // 16/500 gedämpft (§2.3). Die GRÖSSE kommt aus der Leiter — eine
                // zweite 16px-Definition wäre eine zweite Leiter (§4.7).
                <span style={{ ...T.lead, fontWeight: 500, color: "var(--fb-muted)" }}>
                  von {nenner}
                </span>
              ) : (
                <span style={{ ...T.lead, fontWeight: 500, color: "var(--fb-muted)" }}>
                  Rückmeldungen
                </span>
              )
            }
          />
          {quote !== null && (
            <>
              <Progress
                percent={quote}
                showInfo={false}
                strokeColor="var(--fb-ink)"
                trailColor="var(--fb-fill)"
              />
              <p style={{ ...T.meta, margin: 0 }}>{quote} % Rücklauf</p>
            </>
          )}
          {ueberzaehlig && (
            <p style={{ ...T.meta, margin: "4px 0 0" }}>
              mehr Rückmeldungen als erfasste Teilnehmer
            </p>
          )}
        </div>
      )}

      <hr style={HAARLINIE} />
      {survey.closesAt && (
        <p style={{ ...T.meta, margin: 0 }}>
          Antworten sind bis {formatZeitpunkt(survey.closesAt)} möglich.
        </p>
      )}
      {/*
       * „Stand" ist keine Zierde (§4.5): ohne diese Zeile sieht eine gecachte
       * Zahl aus wie eine live gemessene — die einzige Art, wie diese Karte
       * falsch informieren kann. `aria-live` genau hier und nirgends sonst.
       */}
      <p style={{ ...T.meta, margin: "4px 0 0" }} aria-live="polite">
        Stand: {formatUhrzeit(jetzt)}
      </p>

      <hr style={HAARLINIE} />
      <BeendenKnopf surveyId={survey.id} />
    </Card>
  );
}
