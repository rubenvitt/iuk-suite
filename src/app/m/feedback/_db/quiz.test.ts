import { registerAuditFunctions } from "@/core/audit/context";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { insertGroup, insertEvening, getEvening, TagBelegt } from "./queries";
import {
  legeQuizAn,
  aendereQuiz,
  rotiereSecret,
  listeQuizze,
  quizPerSecret,
  loescheQuiz,
  starteOderHoleRunde,
  setzeSchritt,
  beendeRunde,
  beendeAbgelaufene,
  offeneRundePerCode,
  tritteBei,
  antworte,
  rundenDaten,
  heutigeRunde,
  teilnahmePerToken,
  rundenStand,
} from "./quiz";
import { tokenHash } from "@/app/m/feedback/_lib/quiz/codes";
import { beamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import type { QuizFrage } from "@/app/m/feedback/_lib/quiz/fragen";

type DB = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let db: DB;

beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
});
afterEach(() => sqlite.close());

// 2026-11-25 19:00 in Berlin (UTC+1).
const JETZT = new Date("2026-11-25T18:00:00Z");
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);
const MIN = 60_000;
const STD = 60 * MIN;

const frage = (zeit_s?: number): QuizFrage => ({
  text: "Wie viel?",
  typ: "einfach",
  optionen: ["A", "B", "C"],
  richtig: [1],
  ...(zeit_s ? { zeit_s } : {}),
});

const mkGroup = () =>
  insertGroup(db, { name: "G", slug: "g", secret: "abc12", closeAfterHours: null, createdAt: new Date(0) });

function mkQuiz(modus: "lagebild" | "wettbewerb" = "wettbewerb", fragen = [frage(20), frage(), frage()]) {
  const g = mkGroup();
  return legeQuizAn(db, { groupId: g.id, titel: "Funk", modus, fragen, jetzt: JETZT });
}

describe("Quizvorlagen", () => {
  it("legt an, listet, findet per Secret, rotiert und löscht", () => {
    const q = mkQuiz();
    expect(q.moderationSecret.length).toBeGreaterThanOrEqual(43);
    expect(listeQuizze(db, q.groupId).map((r) => r.id)).toEqual([q.id]);
    expect(quizPerSecret(db, q.moderationSecret)?.id).toBe(q.id);
    const neu = rotiereSecret(db, q.id);
    expect(neu).not.toBe(q.moderationSecret);
    expect(quizPerSecret(db, q.moderationSecret)).toBeUndefined();
    expect(quizPerSecret(db, neu)?.id).toBe(q.id);
    loescheQuiz(db, q.id);
    expect(listeQuizze(db, q.groupId)).toEqual([]);
  });

  it("weist ungültige Fragen ab", () => {
    const g = mkGroup();
    expect(() =>
      legeQuizAn(db, {
        groupId: g.id,
        titel: "X",
        modus: "lagebild",
        fragen: [{ text: "", typ: "einfach", optionen: ["A"], richtig: [] }],
        jetzt: JETZT,
      }),
    ).toThrow();
  });
});

describe("starteOderHoleRunde", () => {
  it("zweimal hintereinander → dieselbe Runde (Review Focus 1)", () => {
    const q = mkQuiz();
    const a = starteOderHoleRunde(db, q, JETZT);
    const b = starteOderHoleRunde(db, q, plus(JETZT, 500));
    expect(b.id).toBe(a.id);
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM quiz_runden").get()).toEqual({ c: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM evenings").get()).toEqual({ c: 1 });
    // Zwei Tabs schicken denselben absoluten Schritt: kein Hin und Her.
    setzeSchritt(db, a.id, 1, JETZT);
    const r = setzeSchritt(db, b.id, 1, plus(JETZT, 300));
    expect(r.schritt).toBe(1);
    expect(r.schrittSeit).toBe(JETZT.getTime());
  });

  it("legt den heutigen Abend auf held an, wenn keiner da ist", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const eve = getEvening(db, r.eveningId)!;
    expect(eve.status).toBe("held");
    expect(eve.date.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(r.beitrittCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(r.schritt).toBe(0);
    expect(r.modus).toBe("wettbewerb");
  });

  it("übernimmt einen geplanten Abend von heute und setzt ihn auf held", () => {
    const q = mkQuiz();
    const eve = insertEvening(db, {
      groupId: q.groupId, date: new Date("2026-11-25T00:00:00Z"), topic: "Funk", notes: null,
      participantCount: null, createdAt: new Date(0), status: "planned",
    });
    const r = starteOderHoleRunde(db, q, JETZT);
    expect(r.eveningId).toBe(eve.id);
    expect(getEvening(db, eve.id)!.status).toBe("held");
    expect(getEvening(db, eve.id)!.topic).toBe("Funk");
  });

  it("wirft TagBelegt bei einem abgesagten Abend von heute", () => {
    const q = mkQuiz();
    insertEvening(db, {
      groupId: q.groupId, date: new Date("2026-11-25T00:00:00Z"), topic: null, notes: null,
      participantCount: null, createdAt: new Date(0), status: "cancelled",
    });
    expect(() => starteOderHoleRunde(db, q, JETZT)).toThrow(TagBelegt);
    expect(sqlite.prepare("SELECT COUNT(*) AS c FROM quiz_runden").get()).toEqual({ c: 0 });
  });

  it("legt nach dem Beenden eine neue Runde an", () => {
    const q = mkQuiz();
    const a = starteOderHoleRunde(db, q, JETZT);
    beendeRunde(db, a.id, JETZT);
    const b = starteOderHoleRunde(db, q, plus(JETZT, MIN));
    expect(b.id).not.toBe(a.id);
    expect(b.eveningId).toBe(a.eveningId);
  });
});

describe("aendereQuiz", () => {
  it("lässt den Schnappschuss der offenen Runde unverändert (Review Focus 5)", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const vorher = rundenDaten(db, r.id).runde.fragen;
    aendereQuiz(db, q.id, { titel: "Neu", modus: "lagebild", fragen: [frage(), frage()] }, plus(JETZT, MIN));
    const quiz = quizPerSecret(db, q.moderationSecret)!;
    expect(quiz.titel).toBe("Neu");
    expect(JSON.parse(quiz.fragen)).toHaveLength(2);
    const daten = rundenDaten(db, r.id);
    expect(daten.runde.fragen).toBe(vorher);
    expect(JSON.parse(daten.runde.fragen)).toHaveLength(3);
    expect(daten.runde.modus).toBe("wettbewerb");
    // Die laufende Runde wird wieder aufgenommen, nicht neu gestartet.
    expect(starteOderHoleRunde(db, quiz, plus(JETZT, 2 * MIN)).id).toBe(r.id);
  });
});

describe("setzeSchritt", () => {
  it("bleibt beim selben Wert idempotent", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const a = setzeSchritt(db, r.id, 2, plus(JETZT, MIN));
    const b = setzeSchritt(db, r.id, 2, plus(JETZT, 2 * MIN));
    expect(b.schrittSeit).toBe(a.schrittSeit);
    expect(b.schrittSeit).toBe(plus(JETZT, MIN).getTime());
  });

  it("begrenzt auf [0, schrittAnzahl-1]", () => {
    const q = mkQuiz(); // Wettbewerb, 3 Fragen: 10 Schritte
    const r = starteOderHoleRunde(db, q, JETZT);
    expect(setzeSchritt(db, r.id, 99, JETZT).schritt).toBe(9);
    expect(setzeSchritt(db, r.id, -3, plus(JETZT, 1)).schritt).toBe(0);
  });

  it("öffnet eine Frage ohne Zeitlimit beim Zurückblättern nicht wieder", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "t1", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    setzeSchritt(db, r.id, 4, JETZT); // Frage 1, ohne zeit_s
    setzeSchritt(db, r.id, 5, plus(JETZT, 5_000)); // Auflösung
    const zurueck = setzeSchritt(db, r.id, 4, plus(JETZT, 10_000));
    expect(zurueck.schrittSeit).toBe(plus(JETZT, 10_000).getTime());
    expect(zurueck.hoechsterSchritt).toBe(5);
    expect(antworte(db, r, t.teilnahmeId, 1, [1], plus(JETZT, 11_000))).toBe("geschlossen");
  });

  it("Lobby → vor auf eine schon passierte Frage: geschlossen; die weiteste ist offen", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "t1", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    setzeSchritt(db, r.id, 1, JETZT);
    setzeSchritt(db, r.id, 4, plus(JETZT, 1_000)); // Frage 1, zum ersten Mal: offen
    expect(antworte(db, r, t.teilnahmeId, 1, [1], plus(JETZT, 2_000))).toBe("ok");
    setzeSchritt(db, r.id, 0, plus(JETZT, 3_000)); // Lobby
    setzeSchritt(db, r.id, 1, plus(JETZT, 4_000)); // Frage 0 wieder, Timer frisch
    expect(antworte(db, r, t.teilnahmeId, 0, [1], plus(JETZT, 5_000))).toBe("geschlossen");
  });

  it("abgelaufener Timer der weitesten Frage: zurück und wieder vor → geschlossen", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "t1", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    setzeSchritt(db, r.id, 1, JETZT); // Frage 0, 20 s
    setzeSchritt(db, r.id, 0, plus(JETZT, 26_000));
    setzeSchritt(db, r.id, 1, plus(JETZT, 27_000));
    expect(antworte(db, r, t.teilnahmeId, 0, [1], plus(JETZT, 28_000))).toBe("geschlossen");
  });

  it("laufender Timer: zurück und wieder vor verlängert ihn nicht", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "t1", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    setzeSchritt(db, r.id, 1, JETZT); // Frage 0, 20 s
    setzeSchritt(db, r.id, 0, plus(JETZT, 5_000));
    setzeSchritt(db, r.id, 1, plus(JETZT, 10_000));
    const sicht = beamerSicht(rundenDaten(db, r.id), "Funk", plus(JETZT, 11_000));
    expect(sicht.phase).toMatchObject({ art: "frage", offen: true, endetUm: plus(JETZT, 20_000).getTime() });
    expect(antworte(db, r, t.teilnahmeId, 0, [1], plus(JETZT, 21_000))).toBe("geschlossen");
    expect(antworte(db, r, t.teilnahmeId, 0, [1], plus(JETZT, 15_000))).toBe("ok");
    // Die Antwortzeit zählt ab dem ersten Zeigen der Frage.
    expect(rundenDaten(db, r.id).antworten[0].antwortzeitMs).toBe(15_000);
  });

  it("öffnet eine Frage mit Zeitlimit beim Zurückblättern nicht wieder", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "t1", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    setzeSchritt(db, r.id, 1, JETZT); // Frage 0 (20 s)
    setzeSchritt(db, r.id, 2, plus(JETZT, 5_000)); // Auflösung
    setzeSchritt(db, r.id, 1, plus(JETZT, 10_000)); // zurück
    expect(antworte(db, r, t.teilnahmeId, 0, [1], plus(JETZT, 11_000))).toBe("geschlossen");
  });
});

describe("antworte", () => {
  function laufendeRunde(modus: "lagebild" | "wettbewerb" = "wettbewerb") {
    const q = mkQuiz(modus);
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "tok", spitzname: "Anna" });
    if (!("teilnahmeId" in t)) throw new Error("kein Beitritt");
    setzeSchritt(db, r.id, 1, JETZT); // Frage 0, zeit_s 20
    return { r, teilnahmeId: t.teilnahmeId };
  }

  it("weist eine Antwort nach Ablauf von zeit_s ab (Review Focus 4)", () => {
    const { r, teilnahmeId } = laufendeRunde();
    expect(antworte(db, r, teilnahmeId, 0, [1], plus(JETZT, 20_001))).toBe("geschlossen");
    expect(rundenDaten(db, r.id).antworten).toEqual([]);
  });

  it("nimmt eine Antwort an, rechnet Punkte und weist die zweite ab", () => {
    const { r, teilnahmeId } = laufendeRunde();
    expect(antworte(db, r, teilnahmeId, 0, [1], plus(JETZT, 10_000))).toBe("ok");
    expect(antworte(db, r, teilnahmeId, 0, [2], plus(JETZT, 11_000))).toBe("doppelt");
    const [a] = rundenDaten(db, r.id).antworten;
    expect(a).toMatchObject({ frageIndex: 0, richtig: 1, punkte: 750, antwortzeitMs: 10_000 });
    expect(JSON.parse(a.antwort)).toEqual([1]);
  });

  it("weist eine andere Frage als die offene ab", () => {
    const { r, teilnahmeId } = laufendeRunde();
    expect(antworte(db, r, teilnahmeId, 1, [1], plus(JETZT, 1_000))).toBe("geschlossen");
  });

  it("weist ungültige Auswahl und fremde Teilnahmen ab", () => {
    const { r, teilnahmeId } = laufendeRunde();
    expect(antworte(db, r, teilnahmeId, 0, [], plus(JETZT, 1_000))).toBe("ungueltig");
    expect(antworte(db, r, teilnahmeId, 0, [7], plus(JETZT, 1_000))).toBe("ungueltig");
    expect(antworte(db, r, teilnahmeId, 0, [0, 1], plus(JETZT, 1_000))).toBe("ungueltig");
    expect(antworte(db, r, teilnahmeId + 99, 0, [1], plus(JETZT, 1_000))).toBe("ungueltig");
  });

  it("klemmt eine negative Antwortzeit auf 0", () => {
    const { r, teilnahmeId } = laufendeRunde();
    expect(antworte(db, r, teilnahmeId, 0, [1], plus(JETZT, -5_000))).toBe("ok");
    expect(rundenDaten(db, r.id).antworten[0]).toMatchObject({ antwortzeitMs: 0, punkte: 1000 });
  });

  it("Lagebild: keine Antwortzeit, kein Spitzname; nach beendeRunde kein token_hash", () => {
    const { r, teilnahmeId } = laufendeRunde("lagebild");
    tritteBei(db, r, { token: "tok2", spitzname: null });
    expect(antworte(db, r, teilnahmeId, 0, [1], plus(JETZT, 3_000))).toBe("ok");
    let d = rundenDaten(db, r.id);
    expect(d.antworten[0].antwortzeitMs).toBeNull();
    expect(d.teilnahmen.every((t) => t.spitzname === null)).toBe(true);
    expect(d.teilnahmen.every((t) => t.tokenHash !== null)).toBe(true);
    beendeRunde(db, r.id, plus(JETZT, MIN));
    d = rundenDaten(db, r.id);
    expect(d.runde.beendetAt).toBe(plus(JETZT, MIN).getTime());
    expect(d.teilnahmen).toHaveLength(2);
    expect(d.teilnahmen.every((t) => t.tokenHash === null)).toBe(true);
    expect(antworte(db, r, teilnahmeId, 0, [1], plus(JETZT, MIN + 1))).toBe("geschlossen");
  });
});

describe("tritteBei", () => {
  it("dasselbe Token zweimal → dieselbe Teilnahme (Review Focus 2)", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const a = tritteBei(db, r, { token: "tok", spitzname: "Anna" });
    const b = tritteBei(db, r, { token: "tok", spitzname: "Anderer Name" });
    expect(b).toEqual(a);
    expect(rundenDaten(db, r.id).teilnahmen).toHaveLength(1);
    expect(rundenDaten(db, r.id).teilnahmen[0].tokenHash).toBe(tokenHash("tok"));
  });

  it("später Beitritt bei Schritt 5: möglich, 0 Punkte für Verpasstes (Review Focus 3)", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const frueh = tritteBei(db, r, { token: "f", spitzname: "Früh" });
    if (!("teilnahmeId" in frueh)) throw new Error();
    setzeSchritt(db, r.id, 1, JETZT);
    antworte(db, r, frueh.teilnahmeId, 0, [1], plus(JETZT, 1_000));
    setzeSchritt(db, r.id, 5, plus(JETZT, MIN));
    const spaet = tritteBei(db, r, { token: "s", spitzname: "Spät" });
    expect("teilnahmeId" in spaet).toBe(true);
    if (!("teilnahmeId" in spaet)) throw new Error();
    setzeSchritt(db, r.id, 7, plus(JETZT, 2 * MIN)); // Frage 2
    expect(antworte(db, r, spaet.teilnahmeId, 2, [1], plus(JETZT, 2 * MIN + 1_000))).toBe("ok");
    const eigene = rundenDaten(db, r.id).antworten.filter((a) => a.teilnahmeId === spaet.teilnahmeId);
    expect(eigene.map((a) => a.frageIndex)).toEqual([2]);
  });

  it("prüft Spitznamen im Wettbewerb: trimmt, kürzt, verlangt 2 Zeichen, eindeutig", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    expect(tritteBei(db, r, { token: "a", spitzname: null })).toEqual({ fehler: "spitzname_fehlt" });
    expect(tritteBei(db, r, { token: "a", spitzname: "  x " })).toEqual({ fehler: "spitzname_fehlt" });
    expect("teilnahmeId" in tritteBei(db, r, { token: "a", spitzname: "  " + "L".repeat(30) })).toBe(true);
    expect(rundenDaten(db, r.id).teilnahmen[0].spitzname).toBe("L".repeat(20));
    expect(tritteBei(db, r, { token: "b", spitzname: "l".repeat(25) })).toEqual({ fehler: "spitzname_vergeben" });
  });

  it("speichert im Lagebild keinen Spitznamen", () => {
    const q = mkQuiz("lagebild");
    const r = starteOderHoleRunde(db, q, JETZT);
    expect("teilnahmeId" in tritteBei(db, r, { token: "a", spitzname: "Anna" })).toBe(true);
    expect(rundenDaten(db, r.id).teilnahmen[0].spitzname).toBeNull();
  });

  it("lehnt den Beitritt in eine beendete Runde ab", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    beendeRunde(db, r.id, JETZT);
    expect(tritteBei(db, r, { token: "a", spitzname: "Anna" })).toEqual({ fehler: "beendet" });
  });
});

describe("beendeAbgelaufene und offeneRundePerCode", () => {
  it("beendet die Runde von gestern", () => {
    const q = mkQuiz();
    // Gestern 23:30 Berlin, heute 00:30 Berlin: erst 1 h vergangen, aber neuer Tag.
    const gestern = new Date("2026-11-24T22:30:00Z");
    const r = starteOderHoleRunde(db, q, gestern);
    const t = tritteBei(db, r, { token: "a", spitzname: "Anna" });
    expect(beendeAbgelaufene(db, new Date("2026-11-24T22:59:00Z"))).toEqual([]);
    expect(beendeAbgelaufene(db, new Date("2026-11-24T23:30:00Z"))).toEqual([r.id]);
    const d = rundenDaten(db, r.id);
    expect(d.runde.beendetAt).not.toBeNull();
    expect("teilnahmeId" in t).toBe(true);
    expect(d.teilnahmen[0].tokenHash).toBeNull();
  });

  it("beendet 6 h nach schritt_seit, nicht nach 5 h", () => {
    const q = mkQuiz();
    const frueh = new Date("2026-11-25T08:00:00Z"); // 09:00 Berlin
    const r = starteOderHoleRunde(db, q, frueh);
    expect(beendeAbgelaufene(db, plus(frueh, 5 * STD))).toEqual([]);
    expect(beendeAbgelaufene(db, plus(frueh, 6 * STD + MIN))).toEqual([r.id]);
  });

  it("findet die offene Runde per Code, aber keine abgelaufene", () => {
    const q = mkQuiz();
    const frueh = new Date("2026-11-25T08:00:00Z");
    const r = starteOderHoleRunde(db, q, frueh);
    expect(offeneRundePerCode(db, r.beitrittCode, plus(frueh, STD))?.id).toBe(r.id);
    expect(offeneRundePerCode(db, r.beitrittCode.toLowerCase(), plus(frueh, STD))?.id).toBe(r.id);
    expect(offeneRundePerCode(db, r.beitrittCode, plus(frueh, 7 * STD))).toBeUndefined();
    expect(rundenDaten(db, r.id).runde.beendetAt).not.toBeNull();
  });

  it("starteOderHoleRunde beendet zuerst die Abgelaufenen", () => {
    const q = mkQuiz();
    const frueh = new Date("2026-11-25T08:00:00Z");
    const a = starteOderHoleRunde(db, q, frueh);
    const b = starteOderHoleRunde(db, q, plus(frueh, 7 * STD));
    expect(b.id).not.toBe(a.id);
    expect(rundenDaten(db, a.id).runde.beendetAt).not.toBeNull();
  });
});

describe("heutigeRunde, teilnahmePerToken, rundenStand", () => {
  it("liefert ohne Runde nichts und schreibt nichts", () => {
    const q = mkQuiz();
    expect(heutigeRunde(db, q.id, JETZT)).toBeUndefined();
    expect(db.select().from(schema.quizRunden).all()).toEqual([]);
    expect(db.select().from(schema.evenings).all()).toEqual([]);
  });

  it("liefert die offene Runde von heute, nach dem Beenden die beendete, nie die von gestern", () => {
    const q = mkQuiz();
    const gestern = new Date("2026-11-24T18:00:00Z");
    const alt = starteOderHoleRunde(db, q, gestern);
    beendeRunde(db, alt.id, gestern);
    expect(heutigeRunde(db, q.id, JETZT)).toBeUndefined();
    const r = starteOderHoleRunde(db, q, JETZT);
    expect(heutigeRunde(db, q.id, JETZT)?.id).toBe(r.id);
    beendeRunde(db, r.id, JETZT);
    const beendet = heutigeRunde(db, q.id, JETZT);
    expect(beendet?.id).toBe(r.id);
    expect(beendet?.beendetAt).not.toBeNull();
    const neu = starteOderHoleRunde(db, q, plus(JETZT, MIN));
    expect(heutigeRunde(db, q.id, plus(JETZT, MIN))?.id).toBe(neu.id);
  });

  it("findet die Teilnahme nur mit dem Token dieser Runde", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const t = tritteBei(db, r, { token: "tok", spitzname: "Anna" });
    expect("teilnahmeId" in t && teilnahmePerToken(db, r.id, "tok")).toBe("teilnahmeId" in t ? t.teilnahmeId : -1);
    expect(teilnahmePerToken(db, r.id, "anders")).toBeNull();
    expect(teilnahmePerToken(db, r.id + 1, "tok")).toBeNull();
    beendeRunde(db, r.id, JETZT);
    expect(teilnahmePerToken(db, r.id, "tok")).toBeNull();
  });

  it("rundenStand: Daten samt Titel, null für eine unbekannte Runde, Ersatztitel ohne Vorlage", () => {
    const q = mkQuiz();
    const r = starteOderHoleRunde(db, q, JETZT);
    const s = rundenStand(db, r.id);
    expect(s?.titel).toBe("Funk");
    expect(s?.daten.runde.id).toBe(r.id);
    expect(rundenStand(db, r.id + 99)).toBeNull();
    loescheQuiz(db, q.id);
    expect(rundenStand(db, r.id)?.titel).toBe("Quiz");
  });
});
