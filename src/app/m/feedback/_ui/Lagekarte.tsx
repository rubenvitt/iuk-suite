import type { CSSProperties } from "react";
import { Card, Progress, Statistic } from "antd";
import type { CockpitZustand, LaufendeLage } from "../_lib/cockpit";
import type { FrageVerteilung } from "../_lib/aggregation";
import { Notenlegende, Notenspur } from "./Noten";
import { T } from "./typo";
import { formatDatumKurz, formatUhrzeit, formatWochentagZeit, formatZeitpunkt } from "./datum";
import { StartFormular } from "./StartFormular";
import { BeendenKnopf } from "./BeendenKnopf";
import { QrGross } from "./QrGross";
import { Aktualisierer, AktualisierenKnopf } from "./Aktualisierer";
import { TeilnehmerzahlNachtragen } from "./AbendBearbeiten";

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
 * „QR-CODE GROSS ZEIGEN" (`QrGross`) HÄNGT HIER, und zwar in JEDER Belegung:
 * §2.3 nennt den Knopf als Primäraktion von C/D und als Sekundäraktion von A/B,
 * §2.4 nennt ihn „den zeitkritischen Handgriff im Gruppenraum … in jedem
 * Zustand ein Tipp weit oben" (J-B-2). Die Zone a leistet das nicht: auf 390px
 * steht sie an DOM-Position 3 und ist im Zustand RUHEND nicht immer sichtbar.
 * Die Karte BAUT die Adresse nicht — sie bekommt sie als `teilnahmeUrl` von der
 * Seite, die sie genau einmal aus den Headern herleitet (`teilnahmeUrlAus`).
 *
 * FARBE: die getönte Fläche in C/D ist `--fb-tint`, der Rücklaufbalken trägt
 * `--fb-ink` auf `--fb-fill`. antds Vorgabe für `Progress` wäre `colorPrimary`,
 * und das ist in diesem Projekt DRK-Rot — ein roter Rücklaufbalken liest sich als
 * Alarm, und Rot gehört im Modul `feedback` nie auf eine Datenfläche (§4.9).
 */

/**
 * Kartenstil aus §2.1. Das Polster steht als VARIABLE, nicht als 20: derselbe
 * Abschnitt verlangt „mobil `body.padding: 16`", und `styles.body` ist bei antd
 * ein Inline-Style — eine Klasse mit Medienabfrage verliert dagegen. Der Wert
 * und sein mobiler Zwilling liegen in `feedback.css` (`--fb-kartenpolster`).
 */
const KARTE = {
  header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
  body: { padding: "var(--fb-kartenpolster)" },
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
  /**
   * Die Notenverteilungen der LAUFENDEN Umfrage — je Bewertungsfrage sechs
   * Zellen (§2.3: „Notenlegende einmal, dann acht kompakte Notenspuren").
   *
   * Kommt aus `verteilungJeFrage` in der Seite, DERSELBEN Datenlage, die die
   * Auswertung gross zeigt (§3.2 Punkt 2). Leere Liste heißt: der Bogen hat
   * keine Schulnotenfrage (reiner Freitext- oder Altbestandsbogen) — dann
   * entfällt der Block, statt eine beschriftete leere Schublade zu zeigen (§4.3).
   *
   * Pflicht wie `freitexte`, aus demselben Grund: `pnpm typecheck` erzwingt die
   * Verdrahtung, für die es keine Seitentests gibt.
   */
  verteilungen: FrageVerteilung[];
  /**
   * Die vollständige Teilnahme-Adresse (`https://host/f/{slug}-{secret}`),
   * hergeleitet in der Seite mit `teilnahmeUrlAus` — DERSELBE Wert, den Zone a
   * zeigt. Die Karte setzt hier nie selbst einen Token zusammen: zwei
   * Herleitungen wären zwei Adressen, und eine davon steht dann gedruckt an der
   * Wand.
   */
  teilnahmeUrl: string;
  /** Nur für die Kopfzeile des Vollbild-Modals — die Karte selbst zeigt ihn nicht. */
  gruppenname: string;
};

export function Lagekarte({
  groupId,
  zustand,
  jetzt,
  stunden,
  heute,
  freitexte,
  verteilungen,
  teilnahmeUrl,
  gruppenname,
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
          verteilungen={verteilungen}
          teilnahmeUrl={teilnahmeUrl}
          gruppenname={gruppenname}
        />
      ) : (
        <StartKarte
          groupId={groupId}
          erststart={belegung === "A"}
          heute={heute}
          stunden={stunden}
          teilnehmerVorbelegung={zustand.letzteTeilnehmerzahl}
          teilnahmeUrl={teilnahmeUrl}
          gruppenname={gruppenname}
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
  teilnahmeUrl,
  gruppenname,
}: {
  groupId: number;
  erststart: boolean;
  heute: string;
  stunden: number;
  teilnehmerVorbelegung: number | null;
  teilnahmeUrl: string;
  gruppenname: string;
}) {
  return (
    <Card
      variant="outlined"
      /*
       * DER TITEL DARF NICHT GEKUERZT WERDEN. Gemessen bei 390px: antds
       * `.ant-card-head-title` traegt `white-space: nowrap; text-overflow:
       * ellipsis`, brauchte 140px und bekam 94 — aus „NÄCHSTER SCHRITT" wurde
       * „NÄCHSTER …". Der Kartenkopf legt `title` und `extra` in EINE Zeile,
       * und das `extra` nahm den Rest.
       *
       * `whiteSpace: "normal"` ueber `styles.title` statt ueber eine eigene
       * Klasse: antds `.ant-card-head-title` ist (0,1,0), eine eigene Klasse
       * waere es auch, und antds Stylesheet kommt spaeter (Falle 5). Ein
       * `styles`-Eintrag landet als Inline-Stil am selben Knoten und gewinnt
       * ohne Spezifitaets-Wettlauf.
       */
      styles={{ ...KARTE, title: { whiteSpace: "normal" } }}
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
      {/*
       * SEKUNDÄRAKTION „QR-Code groß zeigen" NEBEN „Feedback starten" (§2.3,
       * Belegungen A und B). `darstellung="sekundaer"`, weil „Feedback starten"
       * hier der EINE Primärknopf der Seite ist (§2.6) — zwei gefüllte Knöpfe
       * nebeneinander sind keine Rangfolge, sondern eine Frage.
       */}
      <StartFormular
        groupId={groupId}
        heute={heute}
        teilnehmerVorbelegung={teilnehmerVorbelegung}
        stunden={stunden}
        nebenaktion={
          <QrGross url={teilnahmeUrl} gruppenname={gruppenname} darstellung="sekundaer" />
        }
      />
    </Card>
  );
}

/** Belegung C/D — die Karte IST die laufende Umfrage. */
function LaufendeKarte({
  laufend,
  jetzt,
  nullAntworten,
  freitexte,
  verteilungen,
  teilnahmeUrl,
  gruppenname,
}: {
  laufend: LaufendeLage;
  jetzt: Date;
  nullAntworten: boolean;
  freitexte: number;
  verteilungen: FrageVerteilung[];
  teilnahmeUrl: string;
  gruppenname: string;
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
   * Die Notenlegende steht EINMAL über den acht kompakten Spuren, im identischen
   * Sechs-Spalten-Raster (dasselbe, das der Teilnehmer im Fragebogen sieht). Die
   * Verteilungen kommen fertig aus der Seite (`verteilungJeFrage`) — dieselbe
   * Datenlage, die die Auswertung groß zeigt (§3.2 Punkt 2).
   *
   * Die Überschrift erscheint NUR, wenn etwas darunter steht: eine beschriftete
   * leere Schublade ist schlimmer als keine (§4.3). In Belegung C (0 Antworten)
   * entfällt der ganze Block — leere Spuren wären eine Fehlform, nicht eine leere
   * Anzeige.
   */
  const schwankt = responseCount > 0 && responseCount <= 2;
  const spuren = nullAntworten ? [] : verteilungen;
  const zwischenstand = !nullAntworten && (spuren.length > 0 || schwankt || freitexte > 0);

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

      {/*
       * §2.4, wortgenau: „Fehlt `participantCount`: … dazu ein Textknopf
       * ‚Teilnehmerzahl nachtragen‘, der die Zeilenbearbeitung öffnet."
       *
       * Er steht HIER und nicht nur in Zone d, weil `cockpitZustand.verlauf` den
       * laufenden Abend ausschließt (§2.2) — ohne diesen Knopf wäre der
       * Hauptfall unerreichbar: die Teilnehmerzahl wird typischerweise erst am
       * Abend selbst bekannt, und sie ist der Nenner jeder Rücklaufquote.
       *
       * AUSSERHALB der `nullAntworten`-Ternäre, und das ist die eigentliche
       * Aussage: gerade in Belegung C — läuft, noch keine Rückmeldung — fehlt die
       * Teilnehmerzahl am häufigsten, weil sie am Abend nachgetragen wird, bevor
       * jemand antwortet. Im `else`-Zweig eingeschlossen wäre er dort NICHT
       * gerendert, und weil `verlauf` den laufenden Abend ausschließt, gäbe es in
       * diesem Zustand keinen Weg zu `updateEveningAction` — auch nicht für die
       * Datumskorrektur, an der die Neuankerung von `closesAt` hängt. Der Entwurf
       * knüpft den Knopf an „Fehlt `participantCount`", nicht an „es gibt schon
       * Rückmeldungen": nicht wieder in einen Zweig einrücken.
       */}
      {nenner === null && (
        <TeilnehmerzahlNachtragen
          abend={{
            eveningId: evening.id,
            datum: evening.date,
            thema: evening.topic,
            teilnehmer: evening.participantCount,
            notizen: evening.notes,
          }}
        />
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
          {spuren.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {/* Die Legende trägt den Abstand der KOMPAKTEN Spur (2px), sonst
                  sitzen Farbfeld und Zelle nicht in derselben Spalte. */}
              <Notenlegende groesse="kompakt" />
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {spuren.map((frage) => (
                  <div key={frage.id} className="fb-spurzeile-kompakt">
                    <span style={{ ...T.meta, minWidth: 0 }}>{frage.text}</span>
                    <Notenspur verteilung={frage.verteilung} groesse="kompakt" />
                  </div>
                ))}
              </div>
            </div>
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
       * PRIMÄRAKTION „QR-Code groß zeigen" VOR „Feedback jetzt beenden" (§2.3,
       * Belegungen C und D). Die Reihenfolge ist die Aussage: solange die Umfrage
       * läuft, ist der laute Handgriff „zeig den Leuten den Code", nicht
       * „beende". Auf 390px stapelt `fb-knopfzeile` beide auf volle Breite —
       * „Feedback jetzt beenden" steht dann DARUNTER, nie daneben (§2.3).
       */}
      <div className="fb-knopfzeile">
        <QrGross url={teilnahmeUrl} gruppenname={gruppenname} darstellung="primaer" />
        <BeendenKnopf surveyId={survey.id} />
      </div>
    </Card>
  );
}
