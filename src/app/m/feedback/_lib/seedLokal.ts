import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import type { GroupRow } from "@/app/m/feedback/_db/schema";
import {
  getGroupBySlug,
  insertGroup,
  insertEvening,
  insertSurvey,
  setSurveyStatus,
  activateSurvey,
  insertResponse,
  insertUserGroup,
  upsertKnownUser,
} from "@/app/m/feedback/_db/queries";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";
import { buildToken } from "@/app/m/feedback/_lib/token";
import {
  computeClosesAt,
  DEFAULT_CLOSE_AFTER_HOURS,
  type EveningStatus,
} from "@/app/m/feedback/_lib/lifecycle";

/**
 * ANREICHERUNG NUR FÜR DIE LOKALE ARBEIT — bewusst NICHT `_lib/seed.ts`.
 *
 * `seed.ts` läuft am Boot, sobald `shouldSeed()` wahr ist — also auch bei
 * `SUITE_SEED=1`, dem Schalter der GENERALPROBE. Ein breiter Datenbestand
 * gehört dort nicht hin. Diese Datei läuft ausschließlich über das lokale
 * Seed-Skript (`scripts/seed-lokal.ts`).
 *
 * WAS SIE LÖST: mit den drei Antworten aus `seed.ts` zeigt die Auswertung drei
 * Balken und der Trend einen Punkt. Hier entstehen zwei zusätzliche Gruppen mit
 * mehreren Abenden ÜBER DIE ZEIT und je 8–12 Antworten, damit Verteilungen,
 * Sektionsunterschiede und Trendlinien lokal überhaupt etwas zeigen.
 *
 * REIN ADDITIV: die Boot-Gruppen (`demo-demo1`, `jugend-jgnd1`) samt ihrer
 * Secrets bleiben unangetastet — der Dev-QR-Link und die E2E-Tests hängen
 * daran. Die Namen hier kollidieren auch nicht: die Gruppenkarten der
 * E2E-Tests werden über eine Überschrift mit `exact: true` gesucht.
 */

const NORD_NAME = "Bereitschaft Nord";
const NORD_SLUG = "bereitschaft-nord";
// 5 Zeichen aus [a-z0-9] — `parseToken` schneidet die letzten fünf ab, der
// Rest ist der slug (der selbst Bindestriche tragen darf).
const NORD_SECRET = "brdn1";

const AUSBILDUNG_NAME = "Ausbildungsgruppe San-A";
const AUSBILDUNG_SLUG = "ausbildung-san-a";
const AUSBILDUNG_SECRET = "sana2";

/**
 * EIGENER Dev-Nutzer, NICHT `dev:gl@localtest.me`.
 *
 * `seed.ts` dokumentiert für den bestehenden Gruppenleiter ausdrücklich, er
 * sehe NUR "Demo Jugend". Hängte man die neuen Gruppen an denselben `sub`, wäre
 * dieser Satz lokal still falsch — und `seed.test.ts` prüft ihn mit einem
 * exakten Array-Vergleich. Ein zweiter Nutzer ist strikt additiv.
 *
 * Der Dev-Login (Credentials-Provider, core/auth/index.ts) erzeugt aus der
 * E-Mail den `sub` `dev:${email}`; das Muster ist in `seed.ts` belegt.
 * Anmeldung: /login mit email=bereitschaft@localtest.me und
 * groups=da-feedback-gl.
 */
const NORD_DEV_EMAIL = "bereitschaft@localtest.me";
const NORD_DEV_USER_ID = `dev:${NORD_DEV_EMAIL}`;

/** Die acht Notenfragen des Standardbogens (q1-q8), in Bogenreihenfolge. */
const NOTENFRAGEN = STANDARD_QUESTIONS.filter((q) => q.type === "schulnote");

/**
 * Streuung ÜBER DIE PERSONEN. Ohne sie träfe jede Person eines Abends dieselbe
 * Note und die Auswertung zeigte statt einer Verteilung einen einzelnen Balken
 * je Frage.
 */
const PERSONEN_VERSATZ = [0, 1, -1, 0, 2, 1, -1, 0, 1, 2, 0, -1];

/**
 * Streuung ÜBER DIE FRAGEN, deterministisch aus Person und Fragenindex. Reicht
 * aus, damit zwei Personen mit gleichem Versatz nicht denselben Bogen abgeben —
 * `computeDAStats` mischt die Antworten über `JSON.stringify` der ganzen Zeile,
 * identische Zeilen wären dort ununterscheidbar.
 */
function wackeln(person: number, frageIndex: number): number {
  // Der Personenfaktor MUSS teilerfremd zu 3 sein. Mit `person * 3` wäre der
  // Summand modulo 3 immer 0 und das Wackeln hinge allein an der Frage: jede
  // Person träfe auf q1 denselben Wert, und bei einem Abendprofil nahe der
  // Skalengrenze klemmte die Begrenzung den Rest auf zwei Noten zusammen.
  return ((person * 5 + frageIndex * 7) % 3) - 1;
}

/** Noten aus einem Abendprofil: `basis[i]` ist die Zielnote für q(i+1). */
function notenFuer(basis: number[], person: number): Record<string, number> {
  const versatz = PERSONEN_VERSATZ[person % PERSONEN_VERSATZ.length];
  const out: Record<string, number> = {};
  NOTENFRAGEN.forEach((frage, i) => {
    const roh = basis[i] + versatz + wackeln(person, i);
    out[frage.id] = Math.min(6, Math.max(1, roh));
  });
  return out;
}

/**
 * Freitexte, bewusst LÜCKENHAFT: im Betrieb füllt kaum jemand alle sechs
 * Textfelder. Die Lücken sind der interessante Fall — `computeDAStats` filtert
 * leere Strings heraus, und ohne Lücken sähe man lokal nie, wie eine Frage mit
 * wenigen Nennungen aussieht.
 */
type Textpool = { q9: string[]; q10: string[]; q11: string[]; q13: string[] };

function textenFuer(pool: Textpool, person: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (person % 2 === 0) out.q9 = pool.q9[(person / 2) % pool.q9.length];
  if (person % 3 === 0) out.q10 = pool.q10[(person / 3) % pool.q10.length];
  if (person % 3 === 1) out.q11 = pool.q11[((person - 1) / 3) % pool.q11.length];
  if (person % 4 === 2) out.q13 = pool.q13[((person - 2) / 4) % pool.q13.length];
  // q12 und q14 bleiben leer: zwei Fragen ohne jede Nennung sind ebenfalls ein
  // Zustand, den die Auswertung lokal zeigen können muss.
  return out;
}

interface Abendprofil {
  /** Tage vor heute. 0 = heute. */
  vorTagen: number;
  thema: string;
  notizen: string | null;
  /** Zielnote je Notenfrage q1..q8. */
  basis: number[];
  /** Wie viele Bögen abgegeben wurden. */
  antworten: number;
  /** Teilnehmerzahl laut Anwesenheitsliste — immer >= `antworten`. */
  teilnehmer: number;
  texte: Textpool;
  /** Nur beim JÜNGSTEN Abend einer Gruppe: die Umfrage bleibt offen. */
  offen?: boolean;
}

/**
 * Ein Abend OHNE Erhebung: vorausgeplant oder abgesagt. EIGENER TYP statt eines
 * Flags an `Abendprofil` — dort hängt jedes Feld (Basisnoten, Antworten, Texte,
 * Teilnehmerzahl) an einer Umfrage, die es hier gerade nicht gibt; ein optional
 * gemachtes `Abendprofil` liesse sich auch mit Antworten und Status `planned`
 * ausfüllen, und dieser Widerspruch fiele erst in der Oberfläche auf.
 *
 * `held` ist deshalb ausgeschlossen: ein gelaufener Abend entsteht oben, samt
 * Umfrage. Ohne `Exclude` wäre "held" hier typkorrekt und ergäbe eine Zeile,
 * die behauptet, an jenem Abend sei Dienst gewesen, ohne eine einzige
 * Rückmeldung — die Rücklaufquote im Cockpit läse sich als 0 %.
 */
interface Terminprofil {
  /** Tage AB heute. Negativ ist Vergangenheit — der abgesagte Abend. */
  inTagen: number;
  thema: string;
  notizen: string | null;
  status: Exclude<EveningStatus, "held">;
}

/** Mitternacht UTC von heute minus `tage` — reines Kalenderdatum wie im Schema. */
function abendDatum(jetzt: Date, tage: number): Date {
  return new Date(
    Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate() - tage),
  );
}

function seedGruppe(
  db: BetterSQLite3Database<typeof schema>,
  jetzt: Date,
  opts: {
    name: string;
    slug: string;
    secret: string;
    abende: Abendprofil[];
    termine?: Terminprofil[];
  },
): { gruppe: GroupRow; antworten: number; geplant: number } {
  const gruppe = insertGroup(db, {
    name: opts.name,
    slug: opts.slug,
    secret: opts.secret,
    closeAfterHours: DEFAULT_CLOSE_AFTER_HOURS,
    createdAt: abendDatum(jetzt, opts.abende[0].vorTagen),
  });

  let antwortenGesamt = 0;

  for (const profil of opts.abende) {
    const datum = abendDatum(jetzt, profil.vorTagen);
    const frist = computeClosesAt(datum, DEFAULT_CLOSE_AFTER_HOURS);

    const abend = insertEvening(db, {
      groupId: gruppe.id,
      date: datum,
      topic: profil.thema,
      notes: profil.notizen,
      participantCount: profil.teilnehmer,
      createdAt: datum,
    });

    const umfrage = insertSurvey(db, {
      eveningId: abend.id,
      questions: JSON.stringify(STANDARD_QUESTIONS),
      closeAfterHours: DEFAULT_CLOSE_AFTER_HOURS,
      createdAt: datum,
    });

    if (profil.offen) {
      // Der EINZIGE `activateSurvey`-Aufruf: er setzt activatedAt/closesAt/
      // closedAt konsistent und schliesst in derselben Transaktion jede andere
      // aktive Umfrage der Gruppe (Invariante "max. 1 aktiv"). Zu schliessen
      // gibt es hier nichts mehr — die Historie steht oben schon auf 'closed'.
      activateSurvey(db, umfrage.id, frist, jetzt);
    } else {
      // Kein `activateSurvey` für die Historie: der Kaskaden-Schliesser setzte
      // `closedAt` auf JETZT, und jede vergangene Umfrage behauptete dann, sie
      // sei zur Seed-Zeit geschlossen worden. Die Frist ist der ehrliche Wert.
      setSurveyStatus(db, umfrage.id, "closed", {
        activatedAt: datum,
        closesAt: frist,
        closedAt: frist,
      });
    }

    for (let person = 0; person < profil.antworten; person++) {
      // Abenddatum statt Abgabezeit — wie der öffentliche Abgabepfad
      // (Entwurf 3.9, "keine Uhrzeit").
      insertResponse(
        db,
        umfrage.id,
        { ...notenFuer(profil.basis, person), ...textenFuer(profil.texte, person) },
        datum,
      );
    }
    antwortenGesamt += profil.antworten;
  }

  // Die Abende ohne Erhebung, NACH der Historie. Die Reihenfolge ist
  // gleichgültig (`listEvenings` sortiert nach Datum), das Fehlen der Umfrage
  // ist es nicht: ein geplanter Abend mit Umfrage wäre ein Widerspruch — die
  // Erhebung entsteht erst bei der Freigabe (`releaseSurveyForEvening`).
  let geplant = 0;
  for (const termin of opts.termine ?? []) {
    insertEvening(db, {
      groupId: gruppe.id,
      date: abendDatum(jetzt, -termin.inTagen),
      topic: termin.thema,
      notes: termin.notizen,
      // Keine Teilnehmerzahl: die stammt aus der Anwesenheitsliste und gibt es
      // vor dem Abend nicht. Eine vorab eingetragene Zahl wäre eine Schätzung,
      // die im Cockpit wie eine Zählung aussähe.
      participantCount: null,
      status: termin.status,
      // JETZT, nicht das Abenddatum: bei einem künftigen Termin läge `createdAt`
      // sonst in der Zukunft, und die Zeile behauptete, sie sei nach dem
      // Seed-Lauf entstanden.
      createdAt: jetzt,
    });
    if (termin.status === "planned") geplant += 1;
  }

  return { gruppe, antworten: antwortenGesamt, geplant };
}

/**
 * Bereitschaft Nord: fünf Abende über gut vier Monate mit einem SICHTBAREN
 * TREND (Basisnoten von 4/5 auf 2/1). Der jüngste Abend ist heute und bleibt
 * offen — damit sind Teilnahme-QR, Rücklauf und Auswertung gleichzeitig lokal
 * erreichbar.
 */
const NORD_ABENDE: Abendprofil[] = [
  {
    vorTagen: 140,
    thema: "Nachbesprechung Kreisfeuerwehrtag",
    notizen: "Erster Abend nach der Sommerpause, kurzfristig umgeplant.",
    // Sektion 02 (q4-q6: Struktur, Aufwand, Vorbereitung) deutlich schwächer
    // als Sektion 01 — sonst sähen alle drei Sektionen gleich aus.
    basis: [4, 4, 4, 5, 4, 5, 3, 4],
    antworten: 9,
    teilnehmer: 14,
    texte: {
      q9: ["Dass wir überhaupt zusammengekommen sind.", "Der offene Austausch am Ende."],
      q10: ["Klarere Aufgabenverteilung.", "Was bei der Verpflegung schiefging."],
      q11: ["Vorher einen Ablaufplan verschicken.", "Pünktlich anfangen."],
      q13: ["Einsatznachsorge", "Umgang mit Beschwerden"],
    },
  },
  {
    vorTagen: 105,
    thema: "Sanitätsdienst bei Großveranstaltungen",
    notizen: null,
    basis: [3, 3, 4, 4, 3, 4, 3, 3],
    antworten: 11,
    teilnehmer: 15,
    texte: {
      q9: ["Die Fallbeispiele waren praxisnah.", "Gute Bilder aus echten Einsätzen."],
      q10: ["Dokumentation im Einsatz.", "Zusammenarbeit mit dem Rettungsdienst."],
      q11: ["Weniger Folien, mehr Übung.", "Der Raum war zu warm."],
      q13: ["MANV-Übung", "Funkdisziplin"],
    },
  },
  {
    vorTagen: 70,
    thema: "Realistische Unfalldarstellung",
    notizen: "Gemeinsam mit der Nachbarbereitschaft durchgeführt.",
    basis: [2, 2, 3, 3, 3, 3, 2, 2],
    antworten: 12,
    teilnehmer: 16,
    texte: {
      q9: ["Das Schminken hat allen Spaß gemacht.", "Endlich mal praktisch arbeiten."],
      q10: ["Wie man Wunden noch echter darstellt.", "Materialpflege nach der Übung."],
      q11: ["Mehr Zeit für den Aufbau.", "Die Gruppen waren zu groß."],
      q13: ["Notfalldarstellung im Freien", "Schminktechniken für Verbrennungen"],
    },
  },
  {
    vorTagen: 35,
    thema: "Betreuungsdienst und Notunterkunft",
    notizen: null,
    basis: [2, 2, 2, 3, 2, 2, 2, 2],
    antworten: 10,
    teilnehmer: 13,
    texte: {
      q9: ["Der Aufbau der Feldbetten in der Halle.", "Sehr gut vorbereitet."],
      q10: ["Betreuung von Kindern in der Unterkunft.", "Registrierung von Betroffenen."],
      q11: ["Etwas straffer durch die Theorie.", "Kaum etwas."],
      q13: ["Psychosoziale Notfallversorgung", "Verpflegung im Einsatz"],
    },
  },
  {
    vorTagen: 0,
    thema: "Funkausbildung BOS-Digitalfunk",
    notizen: "Läuft noch — Rückmeldungen kommen über den QR-Code am Aushang.",
    basis: [2, 1, 2, 2, 2, 2, 1, 2],
    antworten: 8,
    teilnehmer: 12,
    offen: true,
    texte: {
      q9: ["Jeder durfte ein Gerät selbst bedienen.", "Kurz, klar, praktisch."],
      q10: ["Rufgruppenwechsel im Einsatz.", "Was tun bei Funkloch."],
      q11: ["Mehr Geräte für die Übung.", "Passt so."],
      q13: ["Kartenkunde", "Zusammenarbeit mit der Leitstelle"],
    },
  },
];

/**
 * ANGESETZT, ABER NOCH NICHT GELAUFEN — ohne diese Termine steht die Zone der
 * kommenden Abende lokal leer, und eine leere Zone ist von einer kaputten nicht
 * zu unterscheiden. Erst mit ihnen sind Freigabe und Absage eines geplanten
 * Abends lokal überhaupt erreichbar.
 *
 * BEWUSST ÜBER `insertEvening` STATT `planEvenings`: die Serienfunktion trägt
 * EIN Thema für alle Termine und legt ausschliesslich `planned` an — hier hat
 * jeder Abend sein eigenes Thema, und der abgesagte gehört in dieselbe
 * Schleife. Die Serienrechnung selbst prüft `serie.test.ts` ohne Datenbank; sie
 * hier nachzubilden bewiese nichts und bände den Seed an eine zweite Form.
 */
const NORD_TERMINE: Terminprofil[] = [
  {
    inTagen: 7,
    thema: "Kartenkunde und Navigation",
    notizen: null,
    status: "planned",
  },
  {
    inTagen: 21,
    thema: "Technik im Einsatz: Stromerzeuger",
    notizen: "Raum und Ausbilder stehen noch nicht fest.",
    status: "planned",
  },
  {
    inTagen: 35,
    thema: "Jahresrückblick und Planung",
    notizen: null,
    status: "planned",
  },
  {
    // ABGESAGT UND IN DER VERGANGENHEIT, zwischen zwei gelaufenen Abenden
    // (105 und 70 Tage her). Der Fall, den die Historie zeigen muss, statt ihn
    // zu löschen — die Begründung dafür steht bei `evenings` in `_db/schema.ts`.
    // Am Rand der Liste wäre er der unauffälligste Platz; mitten im Verlauf
    // sieht man, ob die Darstellung ihn von einem Abend ohne Rücklauf
    // unterscheidet.
    inTagen: -91,
    thema: "Zusammenarbeit mit der Feuerwehr",
    notizen: "Wegen Sturmwarnung abgesagt.",
    status: "cancelled",
  },
];

/**
 * Ausbildungsgruppe San-A: drei Abende, ALLE geschlossen. Damit gibt es lokal
 * auch eine Gruppe OHNE offene Umfrage — der Zustand, in dem das Cockpit
 * "Feedback starten" anbietet statt QR und Rücklauf. Der mittlere Abend ist ein
 * Ausreißer nach unten, damit die Trendlinie nicht bloß monoton fällt.
 *
 * ⚠️ UND SIE BEKOMMT ABSICHTLICH KEINE GEPLANTEN ABENDE (kein `termine` beim
 * Aufruf von `seedGruppe`). „Noch nichts geplant" ist ein eigener Zustand der
 * Oberfläche, und er ist der einzige, den man nicht sieht, wenn ihn keine
 * Gruppe trägt. Wer hier Termine nachträgt, nimmt die einzige Gruppe weg, an
 * der die leere Form lokal zu prüfen ist — dann braucht es vorher eine dritte
 * Gruppe.
 */
const AUSBILDUNG_ABENDE: Abendprofil[] = [
  {
    vorTagen: 84,
    thema: "Herz-Lungen-Wiederbelebung",
    notizen: null,
    basis: [2, 2, 2, 2, 2, 2, 2, 1],
    antworten: 9,
    teilnehmer: 11,
    texte: {
      q9: ["Viel Zeit an der Übungspuppe.", "Ruhige Erklärungen."],
      q10: ["Anwendung des AED.", "Reanimation bei Kindern."],
      q11: ["Mehr Puppen wären gut.", "Nichts."],
      q13: ["AED-Standorte im Ort", "Atemwegssicherung"],
    },
  },
  {
    vorTagen: 56,
    thema: "Wundversorgung und Verbände",
    notizen: "Ausbilder kurzfristig ausgefallen, Ersatz musste improvisieren.",
    basis: [3, 4, 3, 3, 3, 3, 4, 3],
    antworten: 8,
    teilnehmer: 11,
    texte: {
      q9: ["Die Übungen zu zweit.", "Trotz allem gute Stimmung."],
      q10: ["Druckverband richtig anlegen.", "Wundarten unterscheiden."],
      q11: ["Vertretung vorher einarbeiten.", "Material war knapp."],
      q13: ["Verbrennungen", "Knochenbrüche schienen"],
    },
  },
  {
    vorTagen: 21,
    thema: "Notfälle im Kindesalter",
    notizen: null,
    basis: [1, 1, 2, 2, 1, 2, 1, 1],
    antworten: 10,
    teilnehmer: 12,
    texte: {
      q9: ["Sehr einfühlsam erklärt.", "Die Fallbeispiele mit Eltern."],
      q10: ["Fieberkrampf.", "Umgang mit besorgten Angehörigen."],
      q11: ["Gerne länger.", "Alles gut."],
      q13: ["Notfälle bei Senioren", "Allergische Reaktionen"],
    },
  },
];

/**
 * Legt die lokalen Feedback-Daten an. Idempotenz-Gate PRO GRUPPE (nicht ein
 * gemeinsames für beide) — Vorbild ist `seed.ts`: ein abgebrochener Lauf
 * ergänzt sich beim nächsten selbst, statt dauerhaft unvollständig zu bleiben.
 * Alles darunter (Abende, Umfragen, Antworten, Zuordnung) hängt am selben Gate,
 * weil es ohne die Gruppe gar nicht existieren kann.
 */
export async function seedLokalFeedback(
  db: BetterSQLite3Database<typeof schema>,
): Promise<string[]> {
  const jetzt = new Date();
  const zeilen: string[] = [];

  if (getGroupBySlug(db, NORD_SLUG)) {
    zeilen.push(`feedback: Gruppe ${NORD_NAME} (${NORD_SLUG}) war schon da — übersprungen.`);
  } else {
    const { gruppe, antworten, geplant } = seedGruppe(db, jetzt, {
      name: NORD_NAME,
      slug: NORD_SLUG,
      secret: NORD_SECRET,
      abende: NORD_ABENDE,
      termine: NORD_TERMINE,
    });
    insertUserGroup(db, NORD_DEV_USER_ID, gruppe.id);
    // Die Tage ausgeschrieben, nicht nur die Anzahl: wer die Zone prüft, will
    // wissen, ob ein Termin nah genug liegt, um ihn heute freizugeben.
    const geplanteTage = NORD_TERMINE.filter((t) => t.status === "planned")
      .map((t) => t.inTagen)
      .join(", ");
    zeilen.push(
      `feedback: Gruppe ${NORD_NAME} (id ${gruppe.id}) angelegt — ${NORD_ABENDE.length} Abende über ${NORD_ABENDE[0].vorTagen} Tage, ${antworten} Antworten, jüngster Abend OFFEN.`,
      `feedback: offener Bogen — http://feedback.localtest.me:3000/f/${buildToken(NORD_SLUG, NORD_SECRET)}`,
      `feedback: Cockpit — http://feedback.localtest.me:3000/groups/${gruppe.id} · Trend — /groups/${gruppe.id}/trend`,
      `feedback: ${geplant} vorausgeplante Abende (in ${geplanteTage} Tagen) unter „Kommende Abende" und ein abgesagter Abend im Verlauf — ${AUSBILDUNG_NAME} hat bewusst keine.`,
    );
  }

  if (getGroupBySlug(db, AUSBILDUNG_SLUG)) {
    zeilen.push(
      `feedback: Gruppe ${AUSBILDUNG_NAME} (${AUSBILDUNG_SLUG}) war schon da — übersprungen.`,
    );
  } else {
    const { gruppe, antworten } = seedGruppe(db, jetzt, {
      name: AUSBILDUNG_NAME,
      slug: AUSBILDUNG_SLUG,
      secret: AUSBILDUNG_SECRET,
      abende: AUSBILDUNG_ABENDE,
    });
    insertUserGroup(db, NORD_DEV_USER_ID, gruppe.id);
    zeilen.push(
      `feedback: Gruppe ${AUSBILDUNG_NAME} (id ${gruppe.id}) angelegt — ${AUSBILDUNG_ABENDE.length} abgeschlossene Abende, ${antworten} Antworten, KEINE offene Umfrage.`,
      `feedback: Cockpit — http://feedback.localtest.me:3000/groups/${gruppe.id}`,
    );
  }

  // Namensliste für die Zuordnungs-Oberfläche. Ohne diese Zeile steht der neue
  // Gruppenleiter dort erst, nachdem er die Verwaltung einmal geöffnet hat.
  upsertKnownUser(db, {
    userId: NORD_DEV_USER_ID,
    name: "Anke Sommer (Dev)",
    email: NORD_DEV_EMAIL,
    seenAt: jetzt,
  });

  zeilen.push(
    `feedback: eingeschränkte Sicht — Dev-Login mit email=${NORD_DEV_EMAIL} und groups=da-feedback-gl sieht NUR diese beiden Gruppen.`,
    "feedback: volle Sicht — Dev-Login mit groups=da-feedback-admin sieht alle Gruppen, auch die des Boot-Seeds.",
  );

  return zeilen;
}
