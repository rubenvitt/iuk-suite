import type { CSSProperties } from "react";
import { Card, Progress, Statistic } from "antd";
import type { CockpitZustand, LaufendeLage } from "../_lib/cockpit";
import { T } from "./typo";
import { formatDatumKurz, formatUhrzeit, formatWochentagZeit, formatZeitpunkt } from "./datum";
import { StartFormular } from "./StartFormular";
import { BeendenKnopf } from "./BeendenKnopf";
import { Aktualisierer, AktualisierenKnopf } from "./Aktualisierer";

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
 * ein String. Alles Interaktive liegt in `StartFormular`, `BeendenKnopf` und
 * `Aktualisierer`.
 *
 * NOCH NICHT HIER: „QR-CODE GROSS ZEIGEN". §2.3 nennt den Knopf in der Tabelle
 * der fünf Belegungen als Primäraktion von C/D und als Sekundäraktion von A/B,
 * §2.4 nennt ihn „den zeitkritischen Handgriff im Gruppenraum … in jedem
 * Zustand ein Tipp weit oben" (J-B-2). Er fehlt hier, weil er `_ui/QrGross.tsx`
 * (Modal, Client-Insel) und die vollständige Teilnahme-URL aus
 * `headers().get("host")` braucht — beides entsteht in **Task 19**, das dafür
 * `_ui/Lagekarte.tsx` und `(admin)/groups/[groupId]/page.tsx` in seiner
 * Files-Liste und §2.3 in seiner Bindungsliste führt. Ein Knopf ohne Modal wäre
 * die beschriftete leere Schublade aus §4.3; die Zuordnung stellt sicher, dass
 * die Lücke einen Eigentümer hat statt zu verschwinden.
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
  /**
   * Anzahl der Freitext-Antworten der LAUFENDEN Umfrage — der Zwischenstand
   * zählt sie nur (§2.3), er zeigt sie nicht: die Karte hängt im Gruppenraum,
   * während die Leute noch tippen.
   *
   * ABSICHTLICH PFLICHT, nicht `?: number` mit Vorgabe 0: die Zahl kommt aus
   * `computeDAStats` in der Seite (die EINE Aggregationsstelle), und eine stille
   * 0 wäre von einer echten 0 nicht unterscheidbar. So erzwingt `pnpm typecheck`
   * die Verdrahtung, für die es keine Seitentests gibt.
   */
  freitexte: number;
};

export function Lagekarte({
  groupId,
  zustand,
  jetzt,
  stunden,
  heute,
  freitexte,
}: LagekarteProps) {
  const { belegung, laufend, weitereAktive } = zustand;

  return (
    <>
      {laufend ? (
        <LaufendeKarte
          laufend={laufend}
          jetzt={jetzt}
          nullAntworten={belegung === "C"}
          freitexte={freitexte}
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
      {/*
       * FEHLT NOCH (Task 19): die Sekundäraktion „QR-Code groß zeigen" neben
       * „Feedback starten" (§2.3, Belegungen A und B). Begründung und Zuordnung
       * stehen im Dateikopf — sie hängt an `_ui/QrGross.tsx`.
       */}
    </Card>
  );
}

/** Belegung C/D — die Karte IST die laufende Umfrage. */
function LaufendeKarte({
  laufend,
  jetzt,
  nullAntworten,
  freitexte,
}: {
  laufend: LaufendeLage;
  jetzt: Date;
  nullAntworten: boolean;
  freitexte: number;
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

  /**
   * ZWISCHENSTAND (§2.3). „Noch nicht endgültig" ist hier keine Höflichkeit: die
   * Karte hängt im Gruppenraum, während die Leute noch tippen.
   *
   * Bei 1–2 Rückmeldungen der Schwankungshinweis — `responseCount` ist die EINE
   * Wahrheit dafür, keine zweite Zählung. Freitexte werden hier NUR gezählt, nie
   * gezeigt.
   *
   * NOCH NICHT HIER: Notenlegende + acht kompakte Notenspuren. `Notenspur`
   * verlangt eine Verteilung je Frage (`NotenspurProps.verteilung`, Index 0 =
   * Note 1), `computeDAStats` liefert aber nur Mittelwerte. Die fehlende
   * `verteilungJeFrage` gehört nach `_lib/aggregation.ts` und ist ausdrücklich
   * Task 22 zugeordnet (dieselbe Datenlage braucht §3.2 für die
   * Auswertungsseite) — bis dahin ist §2.3 an dieser Stelle unvollständig, und
   * zwar sichtbar statt vergessen.
   *
   * Die Überschrift erscheint NUR, wenn etwas darunter steht: eine beschriftete
   * leere Schublade ist schlimmer als keine (§4.3).
   */
  const schwankt = responseCount > 0 && responseCount <= 2;
  const zwischenstand = !nullAntworten && (schwankt || freitexte > 0);

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
      {zwischenstand && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ ...T.kicker, margin: 0 }}>ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG</p>
          {schwankt && (
            <p style={{ ...T.meta, margin: "8px 0 0" }}>
              Erst {responseCount} {responseCount === 1 ? "Rückmeldung" : "Rückmeldungen"} — die
              Zahlen schwanken noch stark.
            </p>
          )}
          {freitexte > 0 && (
            <p style={{ ...T.meta, margin: "8px 0 0" }}>
              {freitexte} {freitexte === 1 ? "Freitext" : "Freitexte"} — in der Auswertung nachlesen
            </p>
          )}
        </div>
      )}
      {survey.closesAt && (
        <p style={{ ...T.meta, margin: 0 }}>
          Antworten sind bis {formatZeitpunkt(survey.closesAt)} möglich.
        </p>
      )}
      {/*
       * FUSSZEILE (§4.5, §2.3): „Stand: 21:47" + Textknopf „Aktualisieren", und
       * daneben die Insel, die alle 30s von selbst nachfragt.
       *
       * „Stand" ist keine Zierde: ohne diese Zeile sieht eine gecachte Zahl aus
       * wie eine live gemessene — die einzige Art, wie diese Karte falsch
       * informieren kann. `aria-live` genau hier und nirgends sonst (§4.14).
       * Der Knopf ist deshalb GESCHWISTER der Zeile, nicht ihr Kind: seine
       * Beschriftung gehört nicht in die Live-Region.
       *
       * Und erst mit `Aktualisierer` bekommt dieses `aria-live` überhaupt etwas
       * zu melden: ein Knoten, der nach dem Server-Rendern nie mutiert, ist eine
       * tote Vorlesehilfe. Die Bedingung „nur bei laufender Umfrage" aus §4.5
       * ist hier baulich erfüllt — `LaufendeKarte` existiert nur im Zweig
       * `laufend !== null` von `Lagekarte` (§2.2: eine Stelle entscheidet).
       */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
        <p style={{ ...T.meta, margin: 0 }} aria-live="polite">
          Stand: {formatUhrzeit(jetzt)}
        </p>
        <AktualisierenKnopf />
        <Aktualisierer />
      </div>

      <hr style={HAARLINIE} />
      {/*
       * FEHLT NOCH (Task 19): die PRIMÄRAKTION „QR-Code groß zeigen" über
       * „Feedback jetzt beenden" (§2.3, Belegungen C und D). In C/D ist sie die
       * laute Aktion der Karte — Begründung und Zuordnung stehen im Dateikopf.
       */}
      <BeendenKnopf surveyId={survey.id} />
    </Card>
  );
}
