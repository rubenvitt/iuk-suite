import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AV_STATUS, type AvStatus } from "./av";
import {
  ERSATZ_EINTRAGSNAME,
  HINWEIS_DATEINAME,
  ZIP_AUSSCHLUSS_MELDUNGEN,
  archivDisposition,
  dispositionKopfzeile,
  entschaerfeTitel,
  hinweisText,
  planeArchiv,
  type ZipKandidat,
} from "./zip";

const HIER = dirname(fileURLToPath(import.meta.url));

/*
 * Diese Datei entscheidet ueber NAMEN und AUSSCHLUSS, nicht ueber Bytes
 * (Spec §7.7, Plan T21). Sie ist die EINE Quelle fuer beide Archiv-Wege —
 * `api/download/[id]/zip` (T34) und `api/inbox/zip` (T49) —, weil eine zweite
 * Ausschlussregel eine zweite Wahrheit darueber waere, was „freigegeben" heisst.
 *
 * Die vier Alt-Befunde, gegen die hier geprueft wird:
 *  - zwei gleichnamige Dateien ergaben zwei Eintraege gleichen Namens
 *    (`zip/route.ts:86-132`) — was das entpackende Programm daraus macht, war
 *    offen;
 *  - nicht freigegebene Dateien fehlten STILL (es gab die Pruefung gar nicht);
 *  - ein Titel aus Leerzeichen ergab `___.zip` (`zip/route.ts:125`);
 *  - `Content-Disposition` war an allen DREI Stellen
 *    `filename="${encodeURIComponent(name)}"` ohne `filename*` — ein Umlaut kam
 *    als `%C3%9C` beim Empfaenger an.
 */

/** Kurzschreibweise: eine freigegebene Zeile, wie sie ins Archiv gehoert. */
function frei(id: string, name: string): ZipKandidat {
  return { id, name, avStatus: "clean", bytesVollstaendigAt: new Date(1_000) };
}

describe("planeArchiv: gleichnamige Dateien bekommen einen Zaehlsuffix", () => {
  it("drei mal `bericht.pdf` ergeben `bericht.pdf`, `bericht-1.pdf`, `bericht-2.pdf`", () => {
    const plan = planeArchiv([frei("a", "bericht.pdf"), frei("b", "bericht.pdf"), frei("c", "bericht.pdf")]);
    expect(plan.art).toBe("archiv");
    if (plan.art !== "archiv") return;
    expect(plan.eintraege.map((e) => e.eintragsname)).toEqual([
      "bericht.pdf",
      "bericht-1.pdf",
      "bericht-2.pdf",
    ]);
    // Die Zuordnung zur Zeile muss erhalten bleiben: der Streamer (T34) holt
    // die Bytes ueber die id, nicht ueber den Namen.
    expect(plan.eintraege.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("der Suffix steht VOR der Endung, nicht dahinter", () => {
    const plan = planeArchiv([frei("a", "bericht.pdf"), frei("b", "bericht.pdf")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    // `bericht.pdf-1` waere fuer jedes Betriebssystem eine Datei ohne Typ.
    expect(plan.eintraege[1].eintragsname).toBe("bericht-1.pdf");
  });

  it("ein bereits vergebener Suffixname wird NICHT ein zweites Mal vergeben", () => {
    // DER eigentliche Fallstrick: ein Zaehler je Stammname wuerde die dritte
    // Zeile auf `bericht-1.pdf` legen — genau auf den Namen, den die zweite
    // Zeile schon TRAEGT. Drei gleiche Namen deckt diesen Fall nicht ab, weil
    // dort kein Name von aussen vorbelegt ist.
    const plan = planeArchiv([
      frei("a", "bericht.pdf"),
      frei("b", "bericht-1.pdf"),
      frei("c", "bericht.pdf"),
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    const namen = plan.eintraege.map((e) => e.eintragsname);
    expect(namen).toEqual(["bericht.pdf", "bericht-1.pdf", "bericht-2.pdf"]);
    expect(new Set(namen).size).toBe(namen.length);
  });

  it("ein Name ohne Endung bekommt den Suffix am Ende", () => {
    const plan = planeArchiv([frei("a", "LIESMICH"), frei("b", "LIESMICH")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege.map((e) => e.eintragsname)).toEqual(["LIESMICH", "LIESMICH-1"]);
  });

  it("bei einem Punkt-Namen gilt der Punkt am Anfang NICHT als Endungstrenner", () => {
    const plan = planeArchiv([frei("a", ".gitignore"), frei("b", ".gitignore")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    // `-1.gitignore` haette den Stamm verloren.
    expect(plan.eintraege.map((e) => e.eintragsname)).toEqual([".gitignore", ".gitignore-1"]);
  });

  it("verschiedene Namen bleiben unangetastet", () => {
    const plan = planeArchiv([frei("a", "bericht.pdf"), frei("b", "lage.pdf")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege.map((e) => e.eintragsname)).toEqual(["bericht.pdf", "lage.pdf"]);
  });
});

describe("planeArchiv: der Eintragsname ist kein Pfad", () => {
  it("Pfadtrenner und `..` verlassen das Archivwurzelverzeichnis nicht", () => {
    // `easy-filesharing` konkatenierte `file.filename` UNGEPRUEFT in den
    // S3-Key (`init/route.ts:68`, Analyse 2.2) — auf S3 harmlos, im Bestand
    // also moeglich. Diese Datei ist die letzte Stelle vor der Platte des
    // Empfaengers.
    const plan = planeArchiv([frei("a", "../../etc/passwd"), frei("b", "..")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    for (const { eintragsname } of plan.eintraege) {
      // Die tragende Aussage ist EIN Pfadbestandteil, der keine Verweisung ist.
      // Ein `..` OHNE Trenner (`.._.._etc_passwd`) ist ein gewoehnlicher Name
      // und wird absichtlich nicht weiter verstuemmelt.
      expect(eintragsname).not.toContain("/");
      expect(eintragsname).not.toContain("\\");
      expect([".", ".."]).not.toContain(eintragsname);
    }
    expect(plan.eintraege[0].eintragsname).toBe(".._.._etc_passwd");
  });

  it("ein Backslash-Pfad ebenso", () => {
    const plan = planeArchiv([frei("a", "C:\\Windows\\system32\\x.dll")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege[0].eintragsname).not.toContain("\\");
  });

  it("Steuerzeichen fallen heraus, DEL eingeschlossen", () => {
    // DEL gehoert dazu, weil der Kommentar an `STEUERZEICHEN` es ausdruecklich
    // mitzusagt („inklusive DEL"). Ohne den dritten Codepunkt unten bleibt die
    // Zusicherung auch fuer eine um DEL verkuerzte Zeichenklasse gruen
    // (gemessen: die Suite blieb dabei vollstaendig gruen).
    const plan = planeArchiv([frei("a", "bericht\u0000\u001b\u007f.pdf")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege[0].eintragsname).toBe("bericht.pdf");
  });

  it("ein Name, von dem nichts uebrig bleibt, wird benannt statt leer", () => {
    const plan = planeArchiv([frei("a", "/"), frei("b", "   ")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    for (const eintrag of plan.eintraege) {
      expect(eintrag.eintragsname.trim()).not.toBe("");
    }
    // Und zwei leere Namen kollidieren dann trotzdem nicht.
    expect(new Set(plan.eintraege.map((e) => e.eintragsname)).size).toBe(2);
  });
});

describe("planeArchiv: nicht freigegebene Dateien fehlen und STEHEN im Hinweis", () => {
  it("jeder av_status ausser clean schliesst aus — die Schleife ueber alle fuenf", () => {
    // Die Schleife ist der Punkt: ein `status !== "infected"` statt
    // `istFreigegeben` faellt hier auf, eine einzelne `error`-Zeile nicht.
    const drin: AvStatus[] = [];
    for (const status of AV_STATUS) {
      const plan = planeArchiv([
        { id: "x", name: "x.pdf", avStatus: status, bytesVollstaendigAt: new Date(1_000) },
      ]);
      if (plan.art === "archiv" && plan.eintraege.length === 1) drin.push(status);
    }
    expect(drin).toEqual(["clean"]);
  });

  it("jeder ausschliessende Status traegt SEINEN Grund und eine nichtleere Meldung", () => {
    // Diese Schleife traegt die Typ-Behauptung in `ausschlussGrund`:
    // `istFreigegeben` ist kein Typwaechter, die Einengung auf
    // `Exclude<AvStatus, "clean">` ist dort behauptet. Faellt ein Status aus dem
    // Meldungskatalog, ist `meldung` `undefined` — und diese Zeile rot.
    for (const status of AV_STATUS) {
      if (status === "clean") continue;
      const plan = planeArchiv([
        { id: "x", name: "x.pdf", avStatus: status, bytesVollstaendigAt: new Date(1_000) },
      ]);
      if (plan.art !== "leer") throw new Error("Vorbedingung");
      expect(plan.ausgeschlossen[0].grund).toBe(status);
      expect(plan.ausgeschlossen[0].meldung).toBe(ZIP_AUSSCHLUSS_MELDUNGEN[status]);
      expect(typeof plan.ausgeschlossen[0].meldung).toBe("string");
      expect(plan.ausgeschlossen[0].meldung.length).toBeGreaterThan(0);
    }
  });

  it("`unscanned` ist ausgeschlossen und traegt seinen eigenen Grund", () => {
    // Der Altbestand aus dem Spec-2-Import: sieht harmlos aus, ist gerade der
    // Fall, den noch niemand geprueft hat (§6.2).
    const plan = planeArchiv([
      frei("a", "gut.pdf"),
      { id: "b", name: "alt.pdf", avStatus: "unscanned", bytesVollstaendigAt: new Date(1_000) },
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege.map((e) => e.id)).toEqual(["a"]);
    expect(plan.ausgeschlossen).toEqual([
      {
        id: "b",
        name: "alt.pdf",
        grund: "unscanned",
        meldung: ZIP_AUSSCHLUSS_MELDUNGEN.unscanned,
      },
    ]);
  });

  it("`bytes_vollstaendig_at IS NULL` schliesst aus, auch bei clean", () => {
    const plan = planeArchiv([
      frei("a", "gut.pdf"),
      { id: "b", name: "halb.pdf", avStatus: "clean", bytesVollstaendigAt: null },
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege.map((e) => e.id)).toEqual(["a"]);
    expect(plan.ausgeschlossen[0].grund).toBe("unvollstaendig");
  });

  it("gilt beides, gewinnt die Unvollstaendigkeit — sonst luegt der Grund", () => {
    // Eine Zeile, deren Upload laeuft, ist IMMER `scanning` UND
    // `bytes_vollstaendig_at IS NULL`. Gewaenne der AV-Grund, stuende bei jeder
    // abgebrochenen Uebertragung „Virenpruefung laeuft noch" — und niemand
    // wuerde je erfahren, dass die Bytes fehlen.
    const plan = planeArchiv([
      frei("a", "gut.pdf"),
      { id: "b", name: "halb.pdf", avStatus: "scanning", bytesVollstaendigAt: null },
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.ausgeschlossen[0].grund).toBe("unvollstaendig");
    expect(plan.ausgeschlossen[0].meldung).toBe(ZIP_AUSSCHLUSS_MELDUNGEN.unvollstaendig);
  });

  it("eine ausgeschlossene Zeile verbraucht KEINEN Eintragsnamen", () => {
    // Sonst hiesse die eine ausgelieferte Datei `bericht-1.pdf`, und der
    // Empfaenger sucht nach `bericht.pdf`.
    const plan = planeArchiv([
      { id: "a", name: "bericht.pdf", avStatus: "error", bytesVollstaendigAt: new Date(1_000) },
      frei("b", "bericht.pdf"),
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege).toEqual([{ id: "b", eintragsname: "bericht.pdf" }]);
    // Im Hinweis steht der ORIGINALNAME — eine ausgeschlossene Zeile hat
    // nie einen Eintragsnamen bekommen.
    expect(plan.ausgeschlossen[0].name).toBe("bericht.pdf");
  });

  it("eine Datei, die `_HINWEIS.txt` HEISST, kollidiert nicht mit der Fehlliste", () => {
    // Die Fehlliste ist selbst ein Archiveintrag. Waere ihr Name nicht unter den
    // vergebenen, entstuenden zwei Eintraege gleichen Namens — genau der
    // Alt-Befund, gegen den Zusage 1 steht, nur durch die Hintertuer.
    // `share_files.filename` ist ungepruefter Altbestand, der Name ist also
    // moeglich.
    const plan = planeArchiv([
      frei("a", HINWEIS_DATEINAME),
      { id: "b", name: "krank.pdf", avStatus: "infected", bytesVollstaendigAt: new Date(1_000) },
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.hinweis).not.toBeNull();
    expect(plan.eintraege[0].eintragsname).not.toBe(HINWEIS_DATEINAME);
    expect(plan.eintraege[0].eintragsname).toBe("_HINWEIS-1.txt");
  });

  it("ohne Fehlliste bleibt derselbe Name unangetastet", () => {
    // Die Gegenprobe: geschrieben wird die `_HINWEIS.txt` nur bei Ausschluss.
    // Den Namen auch sonst zu belegen, wuerde eine Datei ohne Anlass umbenennen.
    const plan = planeArchiv([frei("a", HINWEIS_DATEINAME)]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.hinweis).toBeNull();
    expect(plan.eintraege[0].eintragsname).toBe(HINWEIS_DATEINAME);
  });

  it("ohne Ausschluss gibt es keinen Hinweis", () => {
    const plan = planeArchiv([frei("a", "gut.pdf")]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.ausgeschlossen).toEqual([]);
    expect(plan.hinweis).toBeNull();
  });

  it("mit Ausschluss traegt das Archiv eine `_HINWEIS.txt` mit Name UND Grund", () => {
    const plan = planeArchiv([
      frei("a", "gut.pdf"),
      { id: "b", name: "krank.pdf", avStatus: "infected", bytesVollstaendigAt: new Date(1_000) },
      { id: "c", name: "halb.pdf", avStatus: "scanning", bytesVollstaendigAt: null },
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(HINWEIS_DATEINAME).toBe("_HINWEIS.txt");
    expect(plan.hinweis).not.toBeNull();
    const text = plan.hinweis ?? "";
    expect(text).toContain("krank.pdf");
    expect(text).toContain(ZIP_AUSSCHLUSS_MELDUNGEN.infected);
    expect(text).toContain("halb.pdf");
    expect(text).toContain(ZIP_AUSSCHLUSS_MELDUNGEN.unvollstaendig);
    // Die ausgelieferte Datei gehoert NICHT in die Fehlliste.
    expect(text).not.toContain("gut.pdf");
  });

  it("ein Zeilenumbruch im Dateinamen faelscht KEINE Zeile in der Fehlliste", () => {
    // `eintragsname` entfernt Steuerzeichen, der Hinweis nahm den Namen ROH —
    // zwei Umgangsweisen mit derselben ungeprueften Altspalte. Ein `\n` in
    // `share_files.filename` erzeugt sonst eine Zeile ueber `gut.pdf`, eine
    // Datei, die tatsaechlich AUSGELIEFERT wurde: dann luegt gerade die Datei,
    // die es gibt, weil ein stilles Weglassen schlimmer waere als ein 403.
    const plan = planeArchiv([
      frei("a", "gut.pdf"),
      {
        id: "b",
        name: "a.pdf\n- gut.pdf",
        avStatus: "infected",
        bytesVollstaendigAt: new Date(1_000),
      },
    ]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    const text = plan.hinweis ?? "";
    const fehlzeilen = text.split("\n").filter((z) => z.startsWith("- "));
    // EIN Ausschluss, also genau EINE Fehlzeile.
    expect(fehlzeilen).toHaveLength(1);
    expect(fehlzeilen[0]).toContain("a.pdf");
    expect(text).not.toMatch(/^- gut\.pdf/m);
    // In den DATEN bleibt der Originalname stehen — bereinigt wird nur, was in
    // die Fehlliste geschrieben wird.
    expect(plan.ausgeschlossen[0].name).toContain("a.pdf\n");
  });

  it("der Hinweistext liegt HIER, nicht in den beiden Routen", () => {
    // T34 „streamt nur", T49 „baut die Ausschlussregel nicht nach". Waere der
    // Text in den Routen formatiert, gaebe es zwei Texte fuer dieselbe Sache.
    const ausschluss = [
      { id: "b", name: "krank.pdf", grund: "infected" as const, meldung: ZIP_AUSSCHLUSS_MELDUNGEN.infected },
    ];
    expect(hinweisText(ausschluss)).toContain("krank.pdf");
    expect(hinweisText([])).toBeNull();
  });
});

describe("planeArchiv: unbekannte oder fremde ids werden uebergangen und benannt", () => {
  it("die restlichen Dateien kommen, die unbekannte id steht im Hinweis", () => {
    // T49 Punkt 6: eine 404 fuer das ganze Archiv waere in einer
    // Mehrfachauswahl eine Sackgasse.
    const plan = planeArchiv([frei("a", "gut.pdf")], ["zzz"]);
    if (plan.art !== "archiv") throw new Error("Vorbedingung");
    expect(plan.eintraege.map((e) => e.id)).toEqual(["a"]);
    expect(plan.ausgeschlossen).toEqual([
      {
        id: "zzz",
        name: "zzz",
        grund: "nicht-gefunden",
        meldung: ZIP_AUSSCHLUSS_MELDUNGEN["nicht-gefunden"],
      },
    ]);
    expect(plan.hinweis ?? "").toContain("zzz");
  });
});

describe("planeArchiv: alles ausgeschlossen ergibt einen BENANNTEN Zustand", () => {
  it("kein leeres Archiv, sondern `art: leer` mit Grund `alle-ausgeschlossen`", () => {
    const plan = planeArchiv([
      { id: "a", name: "a.pdf", avStatus: "error", bytesVollstaendigAt: new Date(1_000) },
      { id: "b", name: "b.pdf", avStatus: "clean", bytesVollstaendigAt: null },
    ]);
    expect(plan.art).toBe("leer");
    if (plan.art !== "leer") return;
    expect(plan.grund).toBe("alle-ausgeschlossen");
    // Die ZEICHENKETTE, nicht nur ihre Laenge: mit den beiden Texten getauscht
    // blieb die ganze Suite gruen (gemessen), obwohl dieser Fall dann „Hier ist
    // keine Datei vorhanden." behauptet — es gibt welche, sie sind gesperrt.
    // T34 Punkt 3 und T49 Punkt 5 zeigen genau diesen Satz der Person an.
    expect(plan.meldung).toBe("Keine der Dateien ist zum Herunterladen freigegeben.");
    // Die Liste bleibt erhalten: T34 Punkt 3 und T49 Punkt 5 muessen anzeigen,
    // WELCHE Dateien fehlen und warum.
    expect(plan.ausgeschlossen.map((a) => a.grund)).toEqual(["error", "unvollstaendig"]);
  });

  it("gar keine Dateien ist ein EIGENER Grund — sonst sind zwei Faelle einer", () => {
    const plan = planeArchiv([]);
    if (plan.art !== "leer") throw new Error("Vorbedingung");
    expect(plan.grund).toBe("keine-dateien");
    // Der Gegenfall zur Zeile oben: hier ist nichts vorhanden, also darf die
    // Meldung nicht von Freigaben sprechen — sonst sind die zwei Faelle, die
    // `grund` gerade trennt, in der Anzeige wieder einer.
    expect(plan.meldung).toBe("Hier ist keine Datei vorhanden.");
    expect(plan.ausgeschlossen).toEqual([]);
  });

  it("nur unbekannte ids sind ebenfalls `leer`, aber mit ihrer Fehlliste", () => {
    const plan = planeArchiv([], ["zzz"]);
    if (plan.art !== "leer") throw new Error("Vorbedingung");
    expect(plan.grund).toBe("alle-ausgeschlossen");
    expect(plan.ausgeschlossen.map((a) => a.grund)).toEqual(["nicht-gefunden"]);
  });
});

describe("entschaerfeTitel: 1:1 aus zip/route.ts:125, plus die EINE Korrektur", () => {
  it("ersetzt jedes Zeichen ausserhalb `[a-zA-Z0-9_-]` durch `_`", () => {
    // Wortgenau `share.title.replace(/[^a-zA-Z0-9_-]/g, "_")`.
    expect(entschaerfeTitel("Lage 2026-07-30")).toBe("Lage_2026-07-30");
    expect(entschaerfeTitel("Übung/Bilder")).toBe("_bung_Bilder");
    expect(entschaerfeTitel("a.b")).toBe("a_b");
    expect(entschaerfeTitel("Fest!")).toBe("Fest_");
  });

  it("ein Titel aus Leerzeichen ergibt NICHT `___`", () => {
    // Der Alt-Befund: `zip/route.ts:125` ergab `___.zip`. Neu ist der Titel
    // serverseitig getrimmt und auf Nichtleere geprueft (§4.2) — diese Datei
    // ist die zweite Linie, nicht die erste.
    expect(entschaerfeTitel("   ")).not.toBe("___");
    expect(entschaerfeTitel("   ")).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(entschaerfeTitel("")).toBe(entschaerfeTitel("   "));
  });

  it("aber ein Titel, der NUR aus Sonderzeichen besteht, bleibt entschaerft", () => {
    // Die Ausnahme wird ABSICHTLICH nicht auf „Ergebnis ist nur `_`"
    // ausgedehnt: sonst wuerde der Titel „Ü" zu einem Ersatznamen, obwohl er
    // ein Titel ist — und die Zusage „1:1" waere verletzt. Den echten Titel
    // traegt `filename*` (siehe unten).
    expect(entschaerfeTitel("Ü")).toBe("_");
    expect(entschaerfeTitel("+++")).toBe("___");
  });

  it("trimmt aussen, bevor entschaerft wird", () => {
    expect(entschaerfeTitel("  Lage  ")).toBe("Lage");
  });
});

describe("dispositionKopfzeile: beide Formen, und der ASCII-Teil ohne Prozente", () => {
  it("traegt `attachment`, `filename=` und `filename*=UTF-8''`", () => {
    const kopf = dispositionKopfzeile("Übung.zip", "_bung.zip");
    expect(kopf).toContain("attachment");
    expect(kopf).toContain('filename="_bung.zip"');
    expect(kopf).toContain("filename*=UTF-8''%C3%9Cbung.zip");
  });

  it("im ANGEFUEHRTEN Teil steht kein Prozentzeichen — das war der Alt-Fehler", () => {
    // Alt: `filename="${encodeURIComponent(name)}"` an allen drei Stellen. Der
    // Umlaut kam als `%C3%9C` beim Empfaenger an. Eine Zusicherung, die nur
    // „enthaelt %C3%9C" prueft, waere fuer BEIDE Fassungen gruen — deshalb ist
    // die tragende Aussage eine ABWESENHEIT im angefuehrten Teil.
    const kopf = dispositionKopfzeile("Übung.zip", "_bung.zip");
    const angefuehrt = /filename="([^"]*)"/.exec(kopf)?.[1] ?? "FEHLT";
    expect(angefuehrt).toBe("_bung.zip");
    expect(angefuehrt).not.toContain("%");
  });

  it("ein Apostroph im echten Namen wird kodiert — sonst bricht der Header ab", () => {
    // RFC 8187 nutzt `'` als Trenner in `UTF-8''…`; `encodeURIComponent` laesst
    // `!'()*` roh stehen. Ein rohes `'` im Wert beendet die Angabe mitten im
    // Namen.
    const kopf = dispositionKopfzeile("Ü'bung(1)*.zip", "_bung_1__.zip");
    const stern = /filename\*=UTF-8''(\S*)/.exec(kopf)?.[1] ?? "FEHLT";
    expect(stern).not.toContain("'");
    expect(stern).not.toContain("(");
    expect(stern).not.toContain(")");
    expect(stern).not.toContain("*");
    expect(stern).toContain("%27");
  });
});

describe("archivDisposition: der Archivname aus dem Share-Titel", () => {
  it("ASCII-Fallback entschaerft, `filename*` mit dem echten Titel", () => {
    const kopf = archivDisposition("Übung Nord");
    expect(kopf).toContain('filename="_bung_Nord.zip"');
    expect(kopf).toContain("filename*=UTF-8''%C3%9Cbung%20Nord.zip");
  });

  it("die `.zip`-Endung wird NACH der Entschaerfung angehaengt", () => {
    // Sonst wuerde der Punkt selbst zu `_` und der Name hiesse `Lage_zip`.
    expect(archivDisposition("Lage")).toContain('filename="Lage.zip"');
  });

  it("ein Titel aus Leerzeichen ergibt kein `___.zip`", () => {
    const kopf = archivDisposition("   ");
    const angefuehrt = /filename="([^"]*)"/.exec(kopf)?.[1] ?? "FEHLT";
    expect(angefuehrt).not.toBe("___.zip");
    expect(angefuehrt).toMatch(/^[a-zA-Z0-9_-]+\.zip$/);
  });
});

describe("dispositionKopfzeile: der angefuehrte Teil ist header-sicher, egal was kommt", () => {
  /*
   * Vorher stand der Fallback unter einer VORBEDINGUNG, die nur der Kommentar
   * behauptete. `entschaerfeTitel` erfuellt sie zwangsweise (`[a-zA-Z0-9_-]`) —
   * ein Dateiname aus `share_files.filename` / `inbox_files.dateiname`
   * (ungepruefter Altbestand, §4.6) erfuellt sie NICHT, und genau den reichen
   * die beiden Byte-Wege (T33, T51) weiter. Gemessen mit Node 24:
   *  - `filename="ber"icht.pdf"` parst nach der quoted-string-Regel zu `ber`;
   *  - CR, LF oder NUL im Wert lassen `new Headers({…})` mit
   *    `TypeError: Headers.append … is an invalid header value` platzen;
   *  - ein Codepunkt > 255 (Emoji, CJK, `→`) mit
   *    `Cannot convert argument to a ByteString`.
   * Auf einem Byte-Weg ist jedes davon HTTP 500 statt eines Downloads. Die
   * tragende Zusicherung ist deshalb `new Headers(…)` SELBST und nicht ein
   * Ausdruck ueber die Zeichenkette.
   */
  const alsHeader = (kopf: string) => new Headers({ "Content-Disposition": kopf });
  const angefuehrt = (kopf: string) => /filename="([^"]*)"/.exec(kopf)?.[1] ?? "FEHLT";

  it("ein Anfuehrungszeichen im Fallback schneidet den Namen NICHT mitten durch", () => {
    const kopf = dispositionKopfzeile('ber"icht.pdf', 'ber"icht.pdf');
    // Roh weitergegeben ergab der angefuehrte Teil `ber` (gemessen): der
    // Empfaenger bekaeme eine Datei namens `ber` und den Rest als Header-Muell.
    expect(angefuehrt(kopf)).toBe("bericht.pdf");
    expect(() => alsHeader(kopf)).not.toThrow();
  });

  it("ein Backslash im Fallback bleibt nicht als quoted-pair stehen", () => {
    // `\"` waere innerhalb der Anfuehrungszeichen ein maskiertes
    // Anfuehrungszeichen — der Wert liefe ueber sein Ende hinaus.
    const kopf = dispositionKopfzeile("a.pdf", "ber\\icht.pdf");
    expect(angefuehrt(kopf)).toBe("bericht.pdf");
    expect(() => alsHeader(kopf)).not.toThrow();
  });

  it("CR, LF und NUL im Fallback: `new Headers` nimmt die Kopfzeile an", () => {
    const kopf = dispositionKopfzeile(
      "bericht.pdf",
      "bericht\r\nX-Injected: 1\u0000.pdf",
    );
    expect(() => alsHeader(kopf)).not.toThrow();
    expect(alsHeader(kopf).get("x-injected")).toBeNull();
  });

  it("ein Codepunkt jenseits von ASCII im Fallback ebenso", () => {
    // EIGENER Fall, damit das Zuruecknehmen NUR dieses Schrittes genau hier rot
    // wird: ein Emoji- oder CJK-Dateiname ist im Bestand wahrscheinlicher als
    // ein Anfuehrungszeichen, und eine Haertung, die nur `"`, `\` und
    // Steuerzeichen nimmt, laesst ihn weiter platzen.
    const kopf = dispositionKopfzeile("Übung→.pdf", "Übung→.pdf");
    expect(() => alsHeader(kopf)).not.toThrow();
    expect(angefuehrt(kopf)).toBe("_bung_.pdf");
  });

  it("gehaertet wird NUR der Fallback — `filename*` traegt den echten Namen ganz", () => {
    // Sonst waere Zusage 5 verloren: eine Fassung, die BEIDE Argumente
    // bereinigt, besteht jede Zusicherung oben und liefert dem Empfaenger
    // trotzdem `_bung_.pdf` statt `Übung→.pdf`.
    const kopf = dispositionKopfzeile("Übung→.pdf", "Übung→.pdf");
    const stern = /filename\*=UTF-8''(\S*)/.exec(kopf)?.[1] ?? "FEHLT";
    expect(stern).toBe("%C3%9Cbung%E2%86%92.pdf");
    expect(decodeURIComponent(stern)).toBe("Übung→.pdf");
  });

  it("bleibt vom Fallback nichts uebrig, steht dort ein Name statt eines Leerwerts", () => {
    const kopf = dispositionKopfzeile('"""', '"""');
    expect(angefuehrt(kopf)).toBe(ERSATZ_EINTRAGSNAME);
  });

  it("druckbares ASCII bleibt unangetastet, Semikolon und Klammern eingeschlossen", () => {
    // Die Gegenprobe: `;` und `(` sind innerhalb der Anfuehrungszeichen
    // gueltiges qdtext (gemessen), und der Archivweg darf sich durch die
    // Haertung ueberhaupt nicht veraendern.
    expect(angefuehrt(dispositionKopfzeile("a.pdf", "a;b (1).pdf"))).toBe("a;b (1).pdf");
    expect(angefuehrt(archivDisposition("Übung Nord"))).toBe("_bung_Nord.zip");
  });
});

describe("Quelltext-Zusicherung: keine Bytes, kein Client-Modul", () => {
  const quelle = readFileSync(resolve(HIER, "zip.ts"), "utf8");

  it("kein Dateisystem- und kein Pfadzugriff", () => {
    // „Fertig, wenn … diese Datei enthaelt KEINEN Dateisystemzugriff (sie
    // entscheidet ueber Namen und Ausschluss, nicht ueber Bytes)". Auch
    // `path.extname` faellt darunter — die Endung wird hier mit Zeichenarbeit
    // gefunden, weil `path` betriebssystemabhaengig trennt.
    expect(quelle).not.toMatch(/from "node:fs/);
    expect(quelle).not.toMatch(/from "node:path"/);
    expect(quelle).not.toMatch(/require\(/);
  });

  it("`archiver` kommt hier gar nicht vor — auch nicht als Typ", () => {
    // Der Plan nennt T3 als Abhaengigkeit „hier nur fuer den Typ". Diese Datei
    // beruehrt die Archiver-API an keiner Stelle: sie liefert Namen und
    // Ausschluesse, das Streaming baut T34. Ein Typ-Import waere ein Hinweis
    // darauf, dass hier doch Archivierung stattfindet.
    expect(quelle).not.toContain("archiver");
  });

  it("kein `\"use client\"` — QrDialog UND zwei Route-Handler importieren von hier", () => {
    // Falle 6 (docs/design/README.md:87-103): ein WERT aus einem
    // Client-Modul kommt in einer Server Component als Client-Referenz an,
    // HTTP 500 fuer die ganze Seite, und Vitest kann das strukturell nicht
    // sehen. `QrDialog` (T36, Client) holt `entschaerfeTitel` von hier, T34
    // und T49 (Server) holen `planeArchiv`.
    expect(quelle).not.toContain("use client");
  });

  it("die Freigabepruefung ist GERUFEN, nicht nachgebaut", () => {
    expect(quelle).toContain("istFreigegeben");
    // Ein inline `=== "clean"` waere die zweite Wahrheit, die §6.2 verbietet.
    expect(quelle).not.toMatch(/===\s*"clean"/);
  });
});
