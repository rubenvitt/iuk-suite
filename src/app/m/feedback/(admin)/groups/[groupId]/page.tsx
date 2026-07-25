import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Breadcrumb, Button, Card, Col, Row, Statistic } from "antd";
import { getDb } from "../../../_db/client";
import { getGroup, listGroupMembers, listKnownUsers, listResponses } from "../../../_db/queries";
import type { SurveyRow } from "../../../_db/schema";
import { guardPage } from "../../../_lib/guardPage";
import { cockpitZustand } from "../../../_lib/cockpit";
import { computeDAStats, verteilungJeFrage } from "../../../_lib/aggregation";
import { DEFAULT_CLOSE_AFTER_HOURS } from "../../../_lib/lifecycle";
import { buildToken } from "../../../_lib/token";
import type { Question } from "../../../_lib/questions";
import { T } from "../../../_ui/typo";
import { formatDatumKurz, heuteInZone } from "../../../_ui/datum";
import { NOTEN_FENSTER, fensterMittel, notenSatz } from "../../../_lib/noten";
import { Notenpille } from "../../../_ui/Noten";
import { Lagekarte } from "../../../_ui/Lagekarte";
import { Teilnahme, teilnahmeUrlAus } from "../../../_ui/Teilnahme";
import { Verlauf, type VerlaufZeile } from "../../../_ui/Verlauf";
import { EinstellungenPanel } from "../../../_ui/EinstellungenPanel";
import type { ZuordnungPerson } from "../../../_ui/Zuordnung";
import { accessibleGroupFilter, isFeedbackAdmin } from "../../../_lib/access";
import { einstiegZiel } from "../../../_lib/einstieg";

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
 *
 * DIE BREADCRUMB IST BEDINGT (§4.1). „Gruppen › Bereitschaft" gibt es nur für
 * Nutzer, für die der Einstieg eine Seite MIT Inhalt ist — also ab zwei
 * zugänglichen Gruppen oder für einen Voll-Admin. Für den häufigsten Nutzer des
 * Moduls (Gruppenleiter, kein Voll-Admin, genau eine Gruppe) leitet
 * `/m/feedback` per `redirect` sofort wieder hierher: der Krümel wäre garantiert
 * ein Weg auf die Seite zurück, auf der man steht. Entschieden wird das von
 * `einstiegZiel` — DERSELBEN Funktion, die den `redirect` auslöst (§3.1), damit
 * Weiterleitung und Krümel nicht auseinanderlaufen können.
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
  const { viewer, db, memberIds } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();
  const istAdmin = isFeedbackAdmin(viewer);
  // Kein zweiter Datenbankgriff: `memberIds` kommt aus dem Guard, der sie
  // ohnehin gerechnet hat. `einstiegZiel !== null` heißt „der Einstieg leitet
  // diesen Nutzer hierher zurück" — dann keine Breadcrumb (§4.1).
  const einstiegLeitetZurueck =
    einstiegZiel(accessibleGroupFilter(viewer, memberIds), istAdmin) !== null;

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
   * Die Notenspuren des Zwischenstands (§2.3). Ohne laufende Umfrage eine leere
   * Liste — die Karte steht dann in A/B und zeigt das Startformular.
   */
  const laufendeVerteilungen = zustand.laufend
    ? abendVerteilungen(db, zustand.laufend.survey)
    : [];

  /**
   * DIE KONTEXTZEILE DER KOPFZONE (§4.2). Gezählt werden ALLE Dienstabende
   * (auch der laufende — er ist erfasst), gemittelt nur die ABGESCHLOSSENEN:
   * `zustand.verlauf` schließt die laufende Umfrage aus (§2.2), und eine
   * vorläufige Zahl gehört in den Zwischenstand der Lagekarte, nicht in die
   * Kopfzeile, die den Stand der Gruppe zusammenfasst.
   *
   * SEIT ZONE d GILT DER ALTE AUFWANDSSATZ NICHT MEHR, und das ist gewollt: die
   * Zeile aggregierte früher nur die jüngsten sechs Abende (`slice` VOR der
   * Aggregation). Der Verlauf braucht aber eine Note in JEDER Zeile, also läuft
   * `abendStats` ohnehin über alle Abende. Die Kontextzeile schneidet deshalb
   * `verlaufZeilen` — eine bereits gerechnete Liste — statt einen zweiten
   * Sechser-Durchlauf zu fahren. Ein zweiter Durchlauf wäre nicht nur doppelte
   * Arbeit, sondern die Chance, dass Kopfzeile und Tabelle verschiedene
   * Durchschnitte zeigen.
   */
  const abendZahl = zustand.verlauf.length + (zustand.laufend ? 1 : 0);

  /*
   * DIE ZEILEN DES VERLAUFS (§2.5). Sie entstehen HIER und nicht in `Verlauf.tsx`:
   * die Zone ist eine Client-Komponente (Funktions-Props in `columns[].render`,
   * `Dropdown`-`items`, `Popconfirm`-Handler) und sieht keine Datenbank. Was über
   * die RSC-Grenze geht, sind reine Werte — `Date` überlebt, Funktionen nicht.
   *
   * AGGREGIERT WIRD MIT `abendStats` — derselben EINEN Stelle, die auch „Letzter
   * Abend" und der Zwischenstand der Lagekarte lesen. Damit trägt die Zeile
   * `avgSchulnote` und nicht `overallAvg` (§4.12); eine zweite Zählschleife hier
   * wäre eine zweite Wahrheit über denselben Datensatz.
   *
   * In der Betriebsart „Einrichtung" ist `zustand.verlauf` leer, die Schleife
   * läuft also gar nicht — die Zone entfällt weiter unten vollständig.
   */
  const verlaufZeilen: VerlaufZeile[] = zustand.verlauf.map((abend) => {
    const stats = abend.survey ? abendStats(db, abend.survey) : null;
    return {
      eveningId: abend.evening.id,
      surveyId: abend.survey?.id ?? null,
      datum: abend.evening.date,
      thema: abend.evening.topic,
      // Nur die Zeilenbearbeitung liest sie (§2.3 hat `notes` dorthin verwiesen);
      // keine Darstellung der Zone zeigt den Wert.
      notizen: abend.evening.notes,
      rueckmeldungen: abend.responseCount,
      teilnehmer: abend.evening.participantCount,
      avgSchulnote: stats?.avgSchulnote ?? null,
      hasLegacyScale: stats?.hasLegacyScale ?? false,
      entwurf: abend.effektiv === "draft",
    };
  });

  // Die Kontextzeile liest DIESELBEN Zahlen wie die Zone — kein zweiter Durchlauf
  // durch `computeDAStats` und damit keine Chance, dass Kopfzeile und Tabelle
  // verschiedene Durchschnitte zeigen.
  const letzteNoten = verlaufZeilen.slice(0, OE_FENSTER).map((z) => z.avgSchulnote);

  /*
   * DIE ZAHLEN DES LOESCHDIALOGS (§4.6). Gerechnet aus DERSELBEN Liste, die die
   * Zone d zeigt, plus der laufenden Umfrage — behauptete Zahlen („12 Abende")
   * waeren in einem Dialog, der unwiderruflich loescht, die schlimmste Stelle fuer
   * eine Schaetzung.
   */
  const rueckmeldungenGesamt =
    verlaufZeilen.reduce((summe, z) => summe + z.rueckmeldungen, 0) +
    (zustand.laufend?.responseCount ?? 0);

  /*
   * DIE ZUGEORDNETE LEITUNG — NUR fuer Admins geladen (§2.6 Punkt 2). Ein
   * Nicht-Admin bekaeme die Kennungen fremder Personen sonst in seine
   * Client-Nutzlast serialisiert, auch wenn der Block ungerendert bliebe.
   * `listKnownUsers` liefert die Namen; wer noch nie angemeldet war, steht mit
   * seiner Kennung und ohne Namen in der Liste.
   */
  const leitung: ZuordnungPerson[] | undefined = istAdmin
    ? (() => {
        const verzeichnis = new Map(listKnownUsers(db).map((u) => [u.userId, u]));
        return listGroupMembers(db, id).map((userId) => ({
          userId,
          name: verzeichnis.get(userId)?.name ?? null,
          email: verzeichnis.get(userId)?.email ?? null,
        }));
      })()
    : undefined;

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
        {!einstiegLeitetZurueck && (
          <Breadcrumb
            style={T.meta}
            items={[
              // „Gruppen" wortgenau wie §4.1 — dasselbe Wort tragen die Breadcrumbs
              // der Unterseiten, sonst heißt die Wurzel je nach Seite anders.
              { title: <Link href="/m/feedback">Gruppen</Link> },
              { title: group.name },
            ]}
          />
        )}
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
              verteilungen={laufendeVerteilungen}
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

      {/*
       * ZONE d — VERLAUF (§2.1 Punkt 3), volle Breite unter dem Arbeitsfeld. In
       * der Betriebsart „Einrichtung" entfällt sie VOLLSTÄNDIG: ein leeres Fach
       * ist schlimmer als kein Fach (§4.3), und die Lagekarte trägt dort die
       * Schrittzeile.
       */}
      {!einrichtung && (
        <Verlauf groupId={id} zeilen={verlaufZeilen} heute={heuteInZone(jetzt)} />
      )}

      {/*
       * ZONE e — EINSTELLUNGEN (§2.6). Sie steht in JEDEM Zustand, auch in der
       * Betriebsart „Einrichtung": anders als der Verlauf ist sie dort nicht leer,
       * sondern die einzige Stelle, an der Name, Frist und (fuer Admins) die
       * Leitung einer neuen Gruppe korrigierbar sind. Eingeklappt, mit 32px
       * Abstand nach oben (§4.8) — der `gap: 24` des Wrappers plus diese 8.
       */}
      <div style={{ marginTop: 8 }}>
        <EinstellungenPanel
          groupId={id}
          name={group.name}
          closeAfterHours={group.closeAfterHours}
          istAdmin={istAdmin}
          leitung={leitung}
          abende={abendZahl}
          rueckmeldungen={rueckmeldungenGesamt}
        />
      </div>
    </div>
  );
}

/**
 * Das Fenster des Ø aus §4.2: „Ø der letzten sechs". Begründet und definiert in
 * `_lib/noten.ts` (`NOTEN_FENSTER`), weil es die Kopfzeile des Verlaufs (§2.5)
 * genauso braucht — hier steht nur der Name, unter dem die Kopfzone es kennt.
 * Zwei Zahlen wären zwei Fenster.
 */
export const OE_FENSTER = NOTEN_FENSTER;

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
  const kopf = `${abende} ${abende === 1 ? "Dienstabend" : "Dienstabende"} erfasst`;

  // Gerechnet wird in `_lib/noten.ts` (`fensterMittel`) — dieselbe Funktion nutzt
  // die Kopfzeile des Verlaufs (§2.5). Zwei Rechnungen waeren zwei Fenster.
  const gemittelt = fensterMittel(notenJuengsteZuerst);
  if (!gemittelt) return kopf;

  const fenster =
    gemittelt.anzahl === OE_FENSTER
      ? "der letzten sechs"
      : `aus ${gemittelt.anzahl} ${gemittelt.anzahl === 1 ? "Abend" : "Abenden"}`;
  return `${kopf} · Ø ${fenster}: ${notenSatz(gemittelt.mittel)}`;
}

/**
 * Kennzahlen EINES Abends. Beide Leser der Seite („Letzter Abend" und der
 * Zwischenstand der Lagekarte) gehen durch diese Funktion, damit es genau einen
 * Weg von den Rohantworten zu Zahlen gibt.
 */
function abendStats(db: ReturnType<typeof getDb>, survey: SurveyRow) {
  const { questions, antworten } = abendRohdaten(db, survey);
  // `avgSchulnote`, NICHT `overallAvg`: eine 1–5-Altbestandsfrage darf nicht auf
  // die Sechser-Rampe abgetastet werden (§4.12).
  return computeDAStats(questions, antworten);
}

/** Bogen und Rohantworten einer Umfrage — EIN Weg vom `SurveyRow` zu den Werten. */
function abendRohdaten(db: ReturnType<typeof getDb>, survey: SurveyRow) {
  const questions: Question[] = JSON.parse(survey.questions);
  const antworten = listResponses(db, survey.id).map(
    (r) => JSON.parse(r.answers) as Record<string, unknown>,
  );
  return { questions, antworten };
}

/**
 * DIE NOTENSPUREN DES ZWISCHENSTANDS (§2.3). Aus DERSELBEN Funktion, die auch die
 * Auswertung groß zeigt (`verteilungJeFrage`, §3.2 Punkt 2) — acht Verteilungen,
 * sechs Zellen je Frage. Der Mittelwert der Karte und die Spuren stammen damit aus
 * demselben Bogen und denselben Antworten.
 */
function abendVerteilungen(db: ReturnType<typeof getDb>, survey: SurveyRow) {
  const { questions, antworten } = abendRohdaten(db, survey);
  return verteilungJeFrage(questions, antworten);
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
