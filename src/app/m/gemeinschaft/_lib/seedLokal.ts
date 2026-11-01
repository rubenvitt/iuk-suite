import type { GemeinschaftDb } from "../_db/client";
import { anfrage, aufgabe, mitglied, sperrzeit, vorhaben, zustaendig } from "../_db/schema";
import { neueId, neuerLinkCode } from "./kennung";
import { plusTage, tagInZone, wochentag, zeitpunkt } from "./zeit";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag gemeinschaft). Nur erfundene Namen.
 * Acht Mitglieder, drei Projekte, fünf Events (eines vorbei, zwei belegen die Bar), Aufgaben mit und ohne
 * Zuständige, dazu Sperrzeiten und Bar-Anfragen in allen Ständen. Idempotent: gibt es schon ein Mitglied,
 * bleibt alles, wie es ist.
 */
export async function seedLokalGemeinschaft(db: GemeinschaftDb, jetzt = Date.now()): Promise<string[]> {
  if (db.select({ id: mitglied.id }).from(mitglied).limit(1).get()) return ["gemeinschaft: Mitglieder vorhanden, nichts geändert"];
  const heute = tagInZone(jetzt);
  const tag = (n: number) => plusTage(heute, n);
  /** Der nächste Wochentag `wt` (0 = So) mindestens `ab` Tage nach heute, als Abstand in Tagen. */
  const naechster = (wt: number, ab = 0) => { let n = ab; while (wochentag(tag(n)) !== wt) n++; return n; };
  const um = (n: number, hhmm: string) => zeitpunkt(tag(n), hhmm);

  const namen = ["Mira Hofmann", "Jonas Albers", "Lea Kaminski", "Tobias Brandt", "Nele Vogt", "Finn Lorenz", "Sophie Rademacher", "Paul Engel"];
  const m = namen.map((name, i) => ({ id: neueId(), name, telefon: i % 3 === 2 ? "" : `0151 100000${i + 1}`, link: neuerLinkCode(), angelegtAm: jetzt, aktualisiertAm: jetzt }));
  const [mira, jonas, lea, tobias, nele, finn, sophie, paul] = m.map((x) => x.id);

  const wmSa = naechster(6, 21), fr = naechster(5, 8), don = naechster(4, 10), di = naechster(2, 1), sa = naechster(6, 3);
  type A = [titel: string, wer: string[], faellig: string | null, erledigt?: boolean];
  const v: { id: string; art: "event" | "projekt"; titel: string; beschreibung?: string; verantwortlichId: string; projekt?: string; von?: number; bis?: number; ort?: string; barBelegen?: boolean; ziel?: string | null; aufgaben: A[] }[] = [
    { id: neueId(), art: "projekt", titel: "Weihnachtsmarkt-Stand", verantwortlichId: jonas, ziel: tag(wmSa + 1),
      beschreibung: "Glühwein- und Waffelstand der Bereitschaft auf dem Weihnachtsmarkt. Erlös geht in die Jugendarbeit.",
      aufgaben: [["Standplatz beim Ordnungsamt anmelden", [jonas], tag(-6), true], ["Glühwein, Becher und Waffelteig bestellen", [nele], tag(5)],
        ["Schichtplan für beide Tage aufstellen", [mira], tag(7)], ["Deko und Lichterketten aus dem Keller holen", [], tag(12)], ["Kasse und Wechselgeld vorbereiten", [paul], tag(wmSa - 1)]] },
    { id: neueId(), art: "projekt", titel: "Bar renovieren", verantwortlichId: tobias, ziel: tag(40), beschreibung: "Wände neu streichen, bessere Beleuchtung, alte Möbel raus.",
      aufgaben: [["Farbe aussuchen und Angebot einholen", [sophie], tag(-10), true], ["Alte Möbel zum Wertstoffhof bringen", [finn], tag(-3), true], ["Wände streichen", [tobias, finn], tag(16)], ["Neue Lampen anbringen", [], tag(25)]] },
    { id: neueId(), art: "projekt", titel: "Sommerfest vorbereiten", verantwortlichId: lea, ziel: null, beschreibung: "Erste Ideen sammeln. Termin steht noch nicht.",
      aufgaben: [["Termin mit der Bereitschaftsleitung abstimmen", [lea], tag(30)], ["Grill und Zelt ausleihen", [], null], ["Ideen für ein Kinderprogramm sammeln", [sophie, nele], null]] },
  ];
  const wm = v[0].id;
  v.push(
    { id: neueId(), art: "event", projekt: wm, titel: "Weihnachtsmarkt – Samstag", verantwortlichId: jonas, ort: "Marktplatz", von: um(wmSa, "14:00"), bis: um(wmSa, "21:00"), beschreibung: "Aufbau ab 12 Uhr.",
      aufgaben: [["Aufbau Stand", [jonas, finn, paul], null], ["Schicht 14–17 Uhr", [nele, sophie], null], ["Schicht 17–21 Uhr", [tobias], null], ["Abbau und Transport", [], null]] },
    { id: neueId(), art: "event", projekt: wm, titel: "Weihnachtsmarkt – Sonntag", verantwortlichId: jonas, ort: "Marktplatz", von: um(wmSa + 1, "12:00"), bis: um(wmSa + 1, "19:00"),
      aufgaben: [["Schicht 12–15 Uhr", [lea], null], ["Schicht 15–19 Uhr", [], null], ["Abbau, Stand zurück ins Lager", [finn], null]] },
    { id: neueId(), art: "event", titel: "Glühweinabend für die Bereitschaft", verantwortlichId: nele, ort: "Bar", barBelegen: true, von: um(fr, "18:00"), bis: um(fr, "23:00"),
      beschreibung: "Dankeschön an alle Helferinnen und Helfer.", aufgaben: [["Einkauf", [nele], tag(fr - 1)], ["Aufbau ab 17 Uhr", [finn, paul], null], ["Abbau und Spülen", [], null]] },
    { id: neueId(), art: "event", titel: "Spieleabend", verantwortlichId: sophie, ort: "Bar", barBelegen: true, von: um(don, "19:00"), bis: um(don, "22:00"),
      aufgaben: [["Spiele mitbringen", [sophie], null], ["Snacks besorgen", [], null]] },
    { id: neueId(), art: "event", titel: "Helferdankeschön: Grillabend", verantwortlichId: mira, ort: "Hof der Wache", von: um(-12, "17:00"), bis: um(-12, "22:00"),
      aufgaben: [["Grillgut bestellen", [mira], null, true], ["Grill anheizen", [paul], null, true]] },
  );

  db.transaction((tx) => {
    tx.insert(mitglied).values(m).run();
    for (const x of v) {
      tx.insert(vorhaben).values({
        id: x.id, art: x.art, titel: x.titel, beschreibung: x.beschreibung ?? "", verantwortlichId: x.verantwortlichId, projektId: x.projekt ?? null,
        von: x.von ?? null, bis: x.bis ?? null, ort: x.ort ?? "", barBelegen: x.barBelegen ?? false, ziel: x.ziel ?? null, angelegtAm: jetzt, aktualisiertAm: jetzt,
      }).run();
      x.aufgaben.forEach(([titel, wer, faellig, erledigt], position) => {
        const id = neueId();
        tx.insert(aufgabe).values({ id, vorhabenId: x.id, titel, faellig, erledigtAm: erledigt ? jetzt : null, position, angelegtAm: jetzt }).run();
        for (const mitgliedId of wer) tx.insert(zustaendig).values({ aufgabeId: id, mitgliedId }).run();
      });
    }
    const sperre = (n: number, von: string, bis: string, grund: string) => ({ id: neueId(), raum: "bar", von: um(n, von), bis: um(n, bis), grund, angelegtAm: jetzt });
    tx.insert(sperrzeit).values([
      sperre(di, "19:00", "22:00", "Dienstabend Bereitschaft"), sperre(di + 7, "19:00", "22:00", "Dienstabend Bereitschaft"),
      sperre(di + 14, "19:00", "22:00", "Dienstabend Bereitschaft"), sperre(sa + 14, "08:00", "20:00", "Blutspende-Termin"),
    ]).run();
    const frA = naechster(5, 1), so = naechster(0, 4);
    const a = (x: Partial<typeof anfrage.$inferInsert> & Pick<typeof anfrage.$inferInsert, "von" | "bis" | "anlass" | "person" | "kontakt" | "personen">) =>
      ({ id: neueId(), raum: "bar", code: neuerLinkCode(), eingegangenAm: jetzt - 86_400_000, ...x });
    tx.insert(anfrage).values([
      a({ status: "zugesagt", von: um(sa, "18:00"), bis: um(sa + 1, "01:00"), anlass: "40. Geburtstag", person: "Jana Wolff", kontakt: "0151 2345678", personen: 35, hinweis: "Wir bringen Getränke selbst mit.", mitglied: true, vertrag: "unterschrieben", entschiedenAm: jetzt }),
      a({ status: "zugesagt", von: um(frA, "17:00"), bis: um(frA, "21:00"), anlass: "Abschluss Sanitätskurs", person: "Timo Brandes", kontakt: "t.brandes@example.org", personen: 18, mitglied: true, vertrag: "verschickt", entschiedenAm: jetzt }),
      a({ von: um(sa + 7, "17:00"), bis: um(sa + 7, "23:00"), anlass: "Weihnachtsfeier Jugendrotkreuz", person: "Lena Kraus", kontakt: "lena.k@example.org", personen: 25, hinweis: "Mit Kindern, endet spätestens 23 Uhr.", mitglied: true }),
      a({ von: um(sa + 7, "19:00"), bis: um(sa + 8, "00:30"), anlass: "Jahresabschluss Schützenverein", person: "Herbert Lange", kontakt: "05141 98765", personen: 40, hinweis: "Wir würden gern die Musikanlage nutzen." }),
      a({ von: um(so, "14:00"), bis: um(so, "18:00"), anlass: "Kaffeetrinken Seniorengruppe", person: "Erika Sommer", kontakt: "05141 12345", personen: 12 }),
      a({ status: "abgelehnt", von: um(di, "18:00"), bis: um(di, "23:00"), anlass: "Junggesellenabschied", person: "Marco Peters", kontakt: "0170 5556677", personen: 30, begruendung: "Dienstags ist die Bar für den Dienstabend reserviert. Frag gern für einen anderen Tag an.", entschiedenAm: jetzt }),
    ]).run();
  });
  return [`gemeinschaft: ${m.length} Mitglieder, ${v.length} Events und Projekte, 4 Sperrzeiten, 6 Bar-Anfragen`];
}
