import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { inboxFiles, shareFiles, shares, zugangslinks } from "@/app/m/files/_db/schema";
import { bcryptHash } from "@/app/m/files/_lib/passwort";
import { erzeugeToken, tokenHash } from "@/app/m/files/_lib/token";
import { devLogin } from "./fixtures";

/**
 * DIE MOBIL-ABNAHME DES MODULS `files` BEI 390, 834 UND 1280 (Plan T48).
 *
 * ═══ WAS DIESE DATEI BESITZT — UND WAS IHR NICHT GEHOERT ═════════════════════
 *
 * Die Quelltext-Scans `_ui/files-css.test.ts` und `_ui/files-public-css.test.ts`
 * besitzen den SATZ „die Regel traegt die richtige Medienabfrage". Sie koennen
 * eine Kaskadenkollision strukturell NICHT finden: sie kennen weder die
 * Reihenfolge der Stylesheets noch antds eigenes. Genau so ist Falle 5
 * durchgekommen (`docs/design/README.md:64-79`) — die Media-Query-Regel stand
 * da, der Scan war gruen, und der Knopf stand trotzdem auf dem Desktop.
 *
 * Diese Datei besitzt das ERGEBNIS: „man sieht es". Ein Vitest kann das nicht,
 * weil jsdom Media Queries gar nicht auswertet — ein Vitest, der „auf 390px ist
 * X unsichtbar" behauptet und dafuer im DOM sucht, geht IMMER durch.
 *
 * ═══ ABNAHME-TEST, KEIN TDD-TEST ═════════════════════════════════════════════
 *
 * In Stufe 8a existieren alle Ansichten und die Zusagen von T18/T19 sind
 * erfuellt: diese Datei ist von Anfang an gruen, und das ist richtig. Ihr Wert
 * haengt deshalb ganz an der Mutation, gegen die sie gemessen wurde — siehe den
 * naechsten Block.
 *
 * ═══ DIE MUTATION, UND WARUM SIE 900 HEISZT UND NICHT 600 ════════════════════
 *
 * Der Plan nennt als Beispielmutation „eine Media Query von 767.98px auf 600px
 * verschieben". Gegen DIESEN Viewport-Satz misst das nichts, und zwar
 * nachrechenbar: bei 390 liegen beide Fassungen unter der Schwelle (mobil ==
 * mobil), bei 834 und 1280 beide darueber (Desktop == Desktop). Das Band
 * 600–767 wird von keinem der drei Viewports abgetastet. Wer mit dieser
 * Mutation prueft, bekommt dreimal gruen und haelt die Datei danach fuer
 * wertlos — oder, schlimmer, fuer geprueft.
 *
 * Die Mutation, die die zugesagte Eigenschaft trifft, ist `767.98px → 900px` in
 * `_ui/files.css`: bei 390 schweigt sie (mobil so wie so), bei 1280 schweigt sie
 * (Desktop so wie so), und bei 834 wird sie ROT. Das ist woertlich „rot in der
 * Mitte, wo die Enden schweigen" — gemessen, nicht behauptet.
 *
 * DASS DER 600-SHIFT HIER NICHT AUFFAELLT, IST KEINE LUECKE DIESER DATEI: den
 * ZAHLENWERT besitzen die Quelltext-Scans (`shareDetailAktionen.module.css:164`
 * benennt seinen Waechter ausdruecklich). Diese Datei besitzt, ob die Regel die
 * Kaskade GEWINNT — eine andere Aussage, und die einzige, die ein Browser
 * ueberhaupt treffen kann.
 *
 * ═══ WAS SONST NOCH GEMESSEN WURDE, UND WAS DABEI HERAUSKAM ══════════════════
 *
 * 1. `files.css` 767.98 → 900: Punkt 1 und 2 bei **834 rot**, 390 und 1280
 *    gruen. Die tragende Zusage dieser Datei.
 * 2. Punkt 3 und 4 gegen ihre eigene Aussage gedreht (Erwartung `vp.schmal`
 *    invertiert; Trefferflaechen-Schwelle 44 → 60): beide in **allen drei**
 *    Viewports rot, Punkt 1, 2 und 5 unberuehrt gruen. Damit steht fest, dass
 *    die beiden auf einer NICHT-LEEREN Menge arbeiten und zwischen den beiden
 *    Anordnungen wirklich unterscheiden — die haeufigste Bauform eines wertlosen
 *    Layouttests ist die leere Menge, nicht die falsche Zusicherung.
 * 3. ZWEI Mutationen an `posteingang.module.css` blieben gruen, und das ist ein
 *    BEFUND UEBER DAS CSS, nicht ueber diesen Test: weder das Entfernen von
 *    `flex-direction: column` noch das von `.knopfzeile > * { width: 100% }`
 *    aendert die Anordnung. Die beiden Regeln decken einander ab (`column` +
 *    `align-items: stretch` macht die Kinder ohnehin voll breit; ohne `column`
 *    wickelt `flex-wrap: wrap` die 100%-breiten Kinder ohnehin um). Erst beide
 *    zusammen tragen die Zusage. Wer eine davon als Doppelung aufraeumt, faellt
 *    nicht hier auf — sondern erst bei der dritten, die es dann nicht mehr gibt.
 *
 * ═══ „GENAU EINE VON BEIDEN" WAERE ZU SCHWACH ════════════════════════════════
 *
 * Der Plan formuliert fuer 834 „genau EINE von beiden". Woertlich umgesetzt —
 * sichtbare Varianten zaehlen, `=== 1` — ueberlebt die 900er-Mutation: dann sind
 * die Karten sichtbar und die Tabelle verborgen, also weiterhin genau eine. Die
 * Zusicherungen unten sagen deshalb WELCHE: bei 834 dieselbe Belegung wie bei
 * 1280 (Tabelle sichtbar, Karten verborgen). Staerker als der Wortlaut, und der
 * einzige Weg, die Absicht des Tasks („die Mitte prueft, was die Enden nicht
 * sehen") ueberhaupt einzuloesen.
 *
 * ═══ DER BESTAND ENTSTEHT HIER, NICHT IM SEED ════════════════════════════════
 *
 * Die Playwright-Datenbank wird einmal je Lauf geloescht, aber alle Dateien
 * teilen sie sich (`workers: 1`, in Pfadreihenfolge). Ein Test, der „hier liegt
 * eine Freigabe" voraussetzt, ist entweder allein gruen oder in der Suite gruen,
 * nie beides (`docs/design/README.md:214-220`). `sorgeFuerBestand()` legt alles
 * selbst an — genau einmal je Prozess, und es misst nichts, was es nicht vorher
 * sichergestellt hat.
 *
 * DIE ZEILEN ENTSTEHEN UEBER DRIZZLE UND NICHT UEBER DIE OBERFLAECHE, und das
 * ist eine Abwaegung mit einem Preis: der Byte-Weg wird hier NICHT mitgeprueft.
 * Er gehoert `e2e/files-fileshare.spec.ts` und `e2e/files-inbox.spec.ts`; ihn
 * hier ein zweites Mal zu gehen kostete je Test einen kompletten Upload samt
 * AV-Lauf — dreizehnmal, fuer eine Aussage, die schon jemandem gehoert. Was
 * diese Datei braucht, ist eine BELEGUNG, kein Vorgang.
 *
 * ZEITSTEMPEL SIND UNIX-SEKUNDEN (`mode: "timestamp"`), nicht Millisekunden wie
 * im Modul `qr`. Deshalb Drizzle und kein handgeschriebenes `INSERT`: ein
 * `Date.now()` in der Spalte waere ein Faktor-1000-Fehler, der die Ablaufzeit
 * rund 55.000 Jahre in die Zukunft legt — und der Test bliebe gruen.
 *
 * ═══ KEIN AV-LAUF NOETIG ═════════════════════════════════════════════════════
 *
 * Die geseeten Zeilen stehen auf `clean`; die AV-Warteschlange nimmt beim Boot
 * nur `scanning` wieder auf. Deshalb steht hier — anders als in den beiden
 * anderen files-Dateien — KEIN `setzeAvModus`: es gaebe nichts zu scannen, und
 * ein Modus-Schalter ohne Gegenstand waere ein Kommentar in Kodeform.
 * ABER: die BELEGUNG haengt am AV-Zustand. Stuende `scanning` in der Zeile,
 * zeigte `/s/<id>` den ganzseitigen Wartezustand — ohne Dateiliste, ohne
 * Knoepfe, und die 44px-Zusicherung filterte eine leere Menge. `clean` plus
 * vorhandener Blob ist die einzige Belegung, in der es auf `/s/<id>` ueberhaupt
 * etwas zu messen gibt.
 */

const VERWALTUNG = "files.localtest.me";
const V = `http://${VERWALTUNG}:3100`;
const INBOX = "drop.localtest.me";
const I = `http://${INBOX}:3100`;

/** Die Modulgruppe aus dem Registry-Eintrag (`adminGroups: ["drk-files-admin"]`). */
const GRUPPE = "drk-files-admin";

/**
 * DER PFAD STEHT AUSGESCHRIEBEN UND KOMMT NICHT AUS `moduleDbPath()`.
 * `DATA_DIR=./.data/e2e` setzt `playwright.config.ts` in `webServer.env` — das
 * erreicht ausschliesslich den SERVERprozess. Im Testprozess ist die Variable
 * nicht gesetzt; `moduleDbPath("files")` liefe auf `./.data/files.db` und saete
 * in die ENTWICKLUNGSdatenbank, waehrend der Server eine andere Datei liest.
 */
const DB_PFAD = "./.data/e2e/files.db";
/** Dasselbe Schema wie `_lib/storage.ts`: `<DATA_DIR>/files/<shareId>/<fileId>`. */
const ABLAGE = "./.data/e2e/files";

/**
 * FESTE IDs, und sie sind nanoid(10)-FOERMIG (`/^[A-Za-z0-9_-]{10}$/`).
 * `_lib/storage.ts` prueft jede ID, BEVOR sie zu einem Pfad wird, und wirft
 * sonst `UngueltigeId` — eine „schoenere" ID wie `t48-share` waere hier ein
 * HTTP 500 auf dem Downloadweg statt einer Zeile.
 */
const SHARE_OFFEN = "T48shareAA";
const SHARE_PASSWORT = "T48shareBB";
const DATEI_OFFEN = "T48fileAA1";
const INBOX_1 = "T48inboxA1";
const INBOX_2 = "T48inboxA2";
const LINK_ID = "T48linkAA1";

/** Acht Bytes PNG-Signatur plus Fuellung — mehr braucht `signaturTyp` nicht,
 *  und die Vorschau-Zusage haengt am TYP, nicht an der Groesse. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(512),
]);

type Bestand = { token: string };

/**
 * EINMAL JE PROZESS — und ausserdem WIEDERHOLBAR. Beides, und das zweite ist
 * teuer erkauft:
 *
 * Der Modulzustand spart die Arbeit, solange der Prozess lebt. Er lebt aber
 * nicht immer: **Playwright wirft den Arbeiter nach einem Fehlschlag weg und
 * startet einen neuen**. Beim ersten Mutationslauf gegen diese Datei fiel bei
 * 834 ein Test — und die naechsten fuenf starben danach an
 * `UNIQUE constraint failed: shares.id`, weil `bestand` mit dem Arbeiter weg
 * war und der Seed ein zweites Mal einfuegte. Aus einem echten Befund wurden so
 * zehn, davon fuenf Phantome, und in der falschen Richtung waere derselbe
 * Mechanismus fatal: ein Seed-Fehler saehe aus wie ein Layout-Fehler.
 *
 * Deshalb raeumt der Seed VOR dem Einfuegen seine eigenen Zeilen ab. Es geht
 * nicht ohne: der ROHTOKEN wird nie gespeichert (§4.7), ein neuer Prozess kann
 * ihn also nicht wiederfinden und braucht zwingend einen neuen Link.
 */
let bestand: Bestand | null = null;

function sorgeFuerBestand(): Bestand {
  if (bestand !== null) return bestand;

  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — laeuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);

  const token = erzeugeToken();
  const jetzt = new Date();
  const inSiebenTagen = new Date(jetzt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sqlite = new Database(DB_PFAD);
  try {
    // Derselbe Wartewert wie in `core/db`: der Serverprozess haelt dieselbe
    // Datei offen, und ohne ihn scheitert ein Schreibversuch sofort mit
    // SQLITE_BUSY statt kurz zu warten.
    sqlite.pragma("busy_timeout = 5000");
    const db = drizzle(sqlite);

    /*
     * ERST ABRAEUMEN — siehe den Kopf von `sorgeFuerBestand`.
     *
     * IN DIESER REIHENFOLGE, und `share_files` AUSDRUECKLICH: better-sqlite3
     * laesst `PRAGMA foreign_keys` auf AUS, das `onDelete: "cascade"` des
     * Schemas greift auf dieser Verbindung also NICHT. Wer sich darauf
     * verliesse, liesse verwaiste Dateizeilen stehen — und die naechste
     * Uebersicht zaehlte sie mit.
     */
    sqlite.prepare("DELETE FROM inbox_files WHERE id IN (?, ?)").run(INBOX_1, INBOX_2);
    sqlite.prepare("DELETE FROM zugangslinks WHERE id = ?").run(LINK_ID);
    sqlite.prepare("DELETE FROM share_files WHERE share_id IN (?, ?)").run(
      SHARE_OFFEN,
      SHARE_PASSWORT,
    );
    sqlite.prepare("DELETE FROM shares WHERE id IN (?, ?)").run(SHARE_OFFEN, SHARE_PASSWORT);

    db.insert(shares)
      .values([
        {
          id: SHARE_OFFEN,
          title: "T48 — Lagebild Mobilabnahme",
          description: "Belegung fuer die Mobil-Abnahme bei 390, 834 und 1280.",
          type: "file",
          expiresAt: inSiebenTagen,
          maxDownloads: null,
          downloadCount: 0,
          passwordHash: null,
          totalSize: PNG.length,
          createdAt: jetzt,
          createdBy: "e2e",
        },
        {
          id: SHARE_PASSWORT,
          title: "T48 — Freigabe mit Passwort",
          description: null,
          type: "file",
          expiresAt: inSiebenTagen,
          maxDownloads: null,
          downloadCount: 0,
          /*
           * EIN ECHTER bcrypt-HASH und kein Platzhalter. `ladeShare` entscheidet
           * ueber die Maske allein an `password_hash IS NOT NULL`, ein
           * Phantasiewert taete es also — bis jemand die Kette umbaut und der
           * Verify-Weg an einem Hash scheitert, der nie einer war. Die Kosten
           * sind einmalig (cost 12, ~300 ms) und fallen im Seed an, nicht im
           * Test.
           */
          passwordHash: bcryptHash("t48-geheim"),
          totalSize: PNG.length,
          createdAt: jetzt,
          createdBy: "e2e",
        },
      ])
      .run();

    db.insert(shareFiles)
      .values({
        id: DATEI_OFFEN,
        shareId: SHARE_OFFEN,
        filename: "lagebild.png",
        mimeType: "image/png",
        size: PNG.length,
        createdAt: jetzt,
        /*
         * BEIDE Felder gesetzt, und beide sind noetig: ohne
         * `bytes_vollstaendig_at` ist die Zeile „ohne Bytes" (§4.4) und die
         * Ansicht zeigt „wird noch uebertragen" statt der Knoepfe; ohne
         * `av_status = clean` greift fail-closed und es steht der Wartezustand
         * da. In beiden Faellen gaebe es fuer Punkt 3 und 4 nichts zu messen.
         */
        bytesVollstaendigAt: jetzt,
        avStatus: "clean",
        avGeprueftAt: jetzt,
      })
      .run();

    db.insert(zugangslinks)
      .values({
        id: LINK_ID,
        name: "T48 Mobilabnahme",
        tokenStart: token.slice(0, 7),
        tokenHash: tokenHash(token),
        createdAt: jetzt,
        createdBy: "e2e",
        expiresAt: new Date(jetzt.getTime() + 24 * 60 * 60 * 1000),
        revokedAt: null,
        budgetDateien: 50,
        budgetBytes: 50 * 1024 * 1024,
      })
      .run();

    db.insert(inboxFiles)
      .values([
        {
          id: INBOX_1,
          tokenId: LINK_ID,
          dateiname: "meldung-nord.png",
          kategorie: "dokumente",
          hinweis: "Lage Nord, Uebergabe 21:30",
          mimeType: "image/png",
          size: PNG.length,
          clientIpUnbestaetigt: "127.0.0.0",
          empfangenAt: jetzt,
          bytesVollstaendigAt: jetzt,
          avStatus: "clean",
          avGeprueftAt: jetzt,
        },
        {
          id: INBOX_2,
          tokenId: LINK_ID,
          dateiname: "meldung-sued.png",
          kategorie: null,
          hinweis: null,
          mimeType: "image/png",
          size: PNG.length,
          clientIpUnbestaetigt: "127.0.0.0",
          empfangenAt: jetzt,
          bytesVollstaendigAt: jetzt,
          avStatus: "clean",
          avGeprueftAt: jetzt,
        },
      ])
      .run();
  } finally {
    sqlite.close();
  }

  /*
   * DIE BLOBS GEHOEREN DAZU. `ladeShare` misst die Datei auf der Platte
   * (`gemessen()`); fehlt sie, steht in der Zeile „nicht auffindbar" STATT der
   * Knoepfe — und die 44px-Zusicherung filterte wieder eine leere Menge.
   */
  schreibeBlob(`${ABLAGE}/${SHARE_OFFEN}/${DATEI_OFFEN}`);
  schreibeBlob(`${ABLAGE}/inbox/${INBOX_1}`);
  schreibeBlob(`${ABLAGE}/inbox/${INBOX_2}`);

  bestand = { token };
  return bestand;
}

function schreibeBlob(pfad: string): void {
  mkdirSync(pfad.slice(0, pfad.lastIndexOf("/")), { recursive: true });
  writeFileSync(pfad, PNG);
}

// ---------------------------------------------------------------------------

/** Alles, was rechts aus dem Sichtfeld ragt — MIT Namen, damit ein Fehlschlag
 *  den Verursacher nennt und nicht nur eine Zahl. */
async function ueberlauf(page: Page) {
  return page.evaluate(() => ({
    vw: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    schuldige: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.right > window.innerWidth + 1 && b.width > 1 && b.height > 1;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const klasse = typeof el.className === "string" ? el.className : "";
        return `${el.tagName}.${klasse.slice(0, 40)} „${(el.textContent ?? "")
          .trim()
          .slice(0, 20)}" rechts=${Math.round(b.right)}`;
      })
      .slice(0, 5),
  }));
}

/**
 * Jedes sichtbare Bedienelement unter 44px — Beschriftung und Masz, damit der
 * Fehlschlag das Element nennt.
 *
 * FUER AUSWAHLKNOEPFE WIRD DAS LABEL GEMESSEN, nicht der Knopf: `abgabe.module.css`
 * legt die 44px bewusst auf `.wahl` und laesst den UA-Knopf bei 22px — „das ganze
 * Label ist das Ziel". Wer stur den `<input>` misst, meldet zwei Fehlschlaege,
 * die keine sind, und repariert am Ende eine richtige Entscheidung weg.
 */
async function zuKleineZiele(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("a[href], button, input, textarea, select")]
      .map((el) => {
        const typ = el.getAttribute("type");
        const ziel =
          typ === "radio" || typ === "checkbox" ? (el.closest("label") ?? el) : el;
        const b = ziel.getBoundingClientRect();
        const text = (
          el.textContent ||
          el.getAttribute("aria-label") ||
          ziel.textContent ||
          el.id ||
          el.tagName
        )
          .trim()
          .slice(0, 30);
        return { text, w: Math.round(b.width), h: Math.round(b.height) };
      })
      // Nulldimensionen sind nicht gerendert (`display:none`, `<noscript>`) —
      // ein „0x0"-Befund waere ein Phantom.
      .filter((z) => (z.w > 0 || z.h > 0) && (z.w < 44 || z.h < 44))
      .map((z) => `${z.text} ${z.w}x${z.h}`),
  );
}

/**
 * Jedes sichtbare Eingabefeld unter 16px Schriftgroesse.
 *
 * Zoom ist suiteweit gesperrt (`app/layout.tsx`), also kann niemand heranholen,
 * was zu klein ist — die 16px sind deshalb keine iOS-Abwehr mehr, sondern reine
 * Lesbarkeit. Auswahlknoepfe tragen keinen Text und sind ausgenommen.
 */
async function zuKleineSchrift(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea, select",
      ),
    ]
      .map((el) => {
        const b = el.getBoundingClientRect();
        const groesse = parseFloat(getComputedStyle(el).fontSize);
        return { id: el.id || el.getAttribute("name") || el.tagName, b, groesse };
      })
      .filter((f) => f.b.width > 0 && f.b.height > 0 && f.groesse < 16)
      .map((f) => `${f.id} ${f.groesse}px`),
  );
}

type Kasten = { x: number; y: number; width: number; height: number };

async function kaesten(kinder: Locator): Promise<Kasten[]> {
  const anzahl = await kinder.count();
  const aus: Kasten[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    const kasten = await kinder.nth(i).boundingBox();
    expect(kasten, `Knopf ${i} hat keinen Kasten — steht er im DOM und sichtbar?`).not.toBeNull();
    aus.push(kasten!);
  }
  return aus;
}

/**
 * DIE KNOPFREGEL, GEOMETRISCH GEMESSEN — und das ist der Punkt.
 *
 * Ein `getComputedStyle(...).width === "100%"` ginge auch dann durch, wenn die
 * Regel die Kaskade VERLIERT: gemeldet wuerde die deklarierte Absicht, nicht die
 * Wirkung. Genau diese Verwechslung IST Falle 5. Gemessen werden deshalb Lage
 * und Breite der gerenderten Kaesten.
 *
 * Unter 768px: untereinander (jeder Knopf beginnt unterhalb des vorigen) und
 * volle Breite (Containerbreite, 2px Toleranz fuer Raender und Rundung).
 * Ab 768px: nebeneinander (gleiche Oberkante, wachsende linke Kante).
 */
function pruefeKnopfreihe(
  name: string,
  container: Kasten,
  knoepfe: Kasten[],
  schmal: boolean,
): void {
  expect(knoepfe.length, `${name}: mindestens zwei Knoepfe noetig, sonst misst der Test nichts`)
    .toBeGreaterThanOrEqual(2);
  const beschreibung = knoepfe
    .map((k) => `x=${Math.round(k.x)} y=${Math.round(k.y)} b=${Math.round(k.width)}`)
    .join(" | ");

  for (let i = 1; i < knoepfe.length; i += 1) {
    const vorher = knoepfe[i - 1];
    const jetzt = knoepfe[i];
    if (schmal) {
      expect(
        jetzt.y,
        `${name}: Knopf ${i} steht nicht UNTER seinem Vorgaenger — ${beschreibung}`,
      ).toBeGreaterThanOrEqual(vorher.y + vorher.height - 1);
    } else {
      expect(
        Math.abs(jetzt.y - vorher.y),
        `${name}: Knopf ${i} steht nicht auf derselben Zeile — ${beschreibung}`,
      ).toBeLessThanOrEqual(2);
      expect(
        jetzt.x,
        `${name}: Knopf ${i} steht nicht RECHTS neben seinem Vorgaenger — ${beschreibung}`,
      ).toBeGreaterThanOrEqual(vorher.x + vorher.width - 1);
    }
  }

  for (const [i, knopf] of knoepfe.entries()) {
    if (schmal) {
      expect(
        Math.round(knopf.width),
        `${name}: Knopf ${i} ist nicht voll breit (Container ${Math.round(
          container.width,
        )}) — ${beschreibung}`,
      ).toBeGreaterThanOrEqual(Math.round(container.width) - 2);
    } else {
      /*
       * DIE GEGENPROBE, und sie ist keine Zugabe: ohne sie waere „volle Breite
       * unter 768px" mit einer Fassung erfuellbar, die IMMER voll breit ist —
       * und der Desktop-Lauf koennte eine `width: 100%`-Regel, die zu weit
       * greift, gar nicht widerlegen.
       */
      expect(
        Math.round(knopf.width),
        `${name}: Knopf ${i} ist auf dem Desktop voll breit — ${beschreibung}`,
      ).toBeLessThan(Math.round(container.width) - 2);
    }
  }
}

// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { name: "390x844 — das Telefon", breite: 390, hoehe: 844, schmal: true },
  /*
   * DIE MITTE. 834x1112 ist das iPad im Hochformat — und der einzige der drei
   * Viewports, der zwischen dem Suite-Breakpoint (768) und dem Desktop liegt.
   * Zwei Defekte auf Teilprojekt C waren genau von dieser Art: die Knopfregel
   * bei 600 statt 768 (unsichtbar bei 390 UND 1280) und die Kopfzeile mit
   * Mindestbreite 904px zwischen 768 und 903px — Punkt 5 unten sitzt genau in
   * diesem Band. Wer nur die Enden misst, prueft die Mitte nicht.
   */
  { name: "834x1112 — das Tablet im Hochformat", breite: 834, hoehe: 1112, schmal: false },
  /*
   * KEINE ZUGABE. Ein Test, der nur bei 390px misst, kann eine
   * `display:none`-Regel gar nicht widerlegen: dort sagen die richtige und die
   * kaputte Fassung beide „sichtbar".
   */
  { name: "1280x720 — der Desktop", breite: 1280, hoehe: 720, schmal: false },
];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.breite, height: vp.hoehe } });

    test(`1 — Freigaben-Uebersicht zeigt bei ${vp.breite}px die ${
      vp.schmal ? "Kartenliste" : "Tabelle"
    }`, async ({ page }) => {
      sorgeFuerBestand();
      await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

      const antwort = await page.goto(`${V}/`);
      // OHNE DIESE ZEILE misst der Test eine 404- oder 500-Seite als
      // „Darstellung stimmt" — beide haben keine der beiden Varianten im DOM.
      expect(antwort?.status(), "Freigaben-Uebersicht: HTTP").toBe(200);
      await expect(page.getByTestId("files-shares-tabelle")).toBeVisible();

      const tabelle = page.getByTestId("files-shares-tabelle-desktop");
      const karten = page.getByTestId("files-shares-karten");
      // BEIDE stehen im Markup — die Umschaltung ist CSS, nie JavaScript.
      await expect(tabelle).toHaveCount(1);
      await expect(karten).toHaveCount(1);

      if (vp.schmal) {
        await expect(karten).toBeVisible();
        await expect(tabelle).toBeHidden();
      } else {
        // WELCHE, nicht wie viele — siehe Kopfkommentar: „genau eine von beiden"
        // ueberlebt die 900er-Mutation.
        await expect(tabelle).toBeVisible();
        await expect(karten).toBeHidden();
      }
    });

    test(`2 — Posteingang zeigt bei ${vp.breite}px die ${
      vp.schmal ? "Kartenliste" : "Tabelle"
    }`, async ({ page }) => {
      sorgeFuerBestand();
      await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

      const antwort = await page.goto(`${V}/posteingang`);
      expect(antwort?.status(), "Posteingang: HTTP").toBe(200);
      await expect(page.getByTestId("files-posteingang")).toBeVisible();

      const tabelle = page.getByTestId("files-posteingang-tabelle");
      const karten = page.getByTestId("files-posteingang-karten");
      await expect(tabelle).toHaveCount(1);
      await expect(karten).toHaveCount(1);

      if (vp.schmal) {
        await expect(karten).toBeVisible();
        await expect(tabelle).toBeHidden();
      } else {
        await expect(tabelle).toBeVisible();
        await expect(karten).toBeHidden();
      }
    });

    test(`3 — Handlungsknoepfe stehen bei ${vp.breite}px ${
      vp.schmal ? "untereinander in voller Breite" : "nebeneinander"
    }`, async ({ page }) => {
      sorgeFuerBestand();
      await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

      // (a) Die Sammelaktionen des Posteingangs — antd-Knoepfe in eigenem CSS
      //     (`posteingang.module.css`), also die Naht zwischen beiden Welten.
      const antwort = await page.goto(`${V}/posteingang`);
      expect(antwort?.status(), "Posteingang: HTTP").toBe(200);
      const leiste = page.getByTestId("files-inbox-sammelaktionen");
      await expect(leiste).toBeVisible();
      const leistenKasten = (await leiste.boundingBox())!;
      /*
       * DIE BEIDEN KNOEPFE EINZELN, NICHT ALLE KINDER DER LEISTE: „Ausgewaehlte
       * loeschen" sitzt in einem `<form>` — ein Kindselektor traefe die
       * unsichtbare Huelle, und die ist ohne die Klasse `.knopf` am Knopf selbst
       * voll breit, waehrend der Knopf darin auto-breit bliebe. Genau dieser
       * Unterschied ist in `posteingang.module.css` ausgeschrieben, und nur eine
       * Messung AM KNOPF sieht ihn.
       */
      pruefeKnopfreihe(
        "Posteingang — Sammelaktionen",
        leistenKasten,
        [
          (await page.getByTestId("files-inbox-zip").boundingBox())!,
          (await page.getByTestId("files-inbox-loeschen-auswahl").boundingBox())!,
        ],
        vp.schmal,
      );

      // (b) Die Knopfzeile einer Dateizeile auf `/s/<id>` — eigenes CSS ohne
      //     antd (`files-public.css`), die andere Gestaltungsklasse.
      const share = await page.goto(`${V}/s/${SHARE_OFFEN}`);
      expect(share?.status(), "/s/<id>: HTTP").toBe(200);
      const zeile = page.locator(`[data-file-id="${DATEI_OFFEN}"]`);
      await expect(zeile).toBeVisible();
      const knopfzeile = zeile.locator("p.fp-knopfzeile");
      const knoepfe = knopfzeile.locator("a.fp-knopf");
      // Herunterladen UND Vorschau: eine PNG unter `FILES_VORSCHAU_MAX_BYTES`
      // traegt beide. Mit nur einem Knopf pruefte die Reihe nichts.
      await expect(knoepfe).toHaveCount(2);
      pruefeKnopfreihe(
        "/s/<id> — Dateizeile",
        (await knopfzeile.boundingBox())!,
        await kaesten(knoepfe),
        vp.schmal,
      );

      /*
       * UND `/u/<token>` STEHT HIER BEWUSST NICHT. Seine `.fp-knopfzeile` traegt
       * genau EINEN Knopf („Abgeben") — eine Reihe aus einem Element hat weder
       * eine Anordnung noch eine Gegenprobe, `pruefeKnopfreihe` wiese sie
       * ausdruecklich ab. Ein Aufruf ohne Zusicherung stuende hier als Kode, der
       * wie Abdeckung aussieht und keine ist; das ist genau die Bauform, gegen
       * die diese Datei existiert. Die Seite wird in Punkt 4 vollstaendig
       * abgetastet.
       */
    });

    test(`4 — oeffentliche Ansichten bei ${vp.breite}px: kein Ueberlauf, 44px, 16px`, async ({
      page,
    }) => {
      const { token } = sorgeFuerBestand();

      /*
       * OHNE ANMELDUNG. Diese Ansichten werden anonym auf einem fremden Handy
       * geoeffnet; eine Sitzung im Kontext waere ein Zustand, den es dort nie
       * gibt. `devLogin` steht deshalb bewusst NICHT in diesem Test.
       *
       * DREI ADRESSEN, und die mittlere ist die einzige mit einem Eingabefeld:
       * `/s/<offen>` hat gar keins, die 16px-Zusicherung filterte dort eine
       * leere Menge und waere gruen, ohne je etwas gemessen zu haben.
       */
      const adressen: { name: string; url: string; wartet: string; feldPflicht: boolean }[] = [
        { name: "/s/<id> — offen", url: `${V}/s/${SHARE_OFFEN}`, wartet: "files-freigabe", feldPflicht: false },
        {
          name: "/s/<id> — Passwortmaske",
          url: `${V}/s/${SHARE_PASSWORT}`,
          wartet: "files-passwort-maske",
          feldPflicht: true,
        },
        { name: "/u/<token>", url: `${I}/u/${token}`, wartet: "abgabe-formular", feldPflicht: true },
      ];

      for (const adresse of adressen) {
        const antwort = await page.goto(adresse.url);
        expect(antwort?.status(), `${adresse.name}: HTTP`).toBe(200);
        await expect(page.getByTestId(adresse.wartet)).toBeVisible();
        await page.waitForLoadState("networkidle");

        const mass = await ueberlauf(page);
        expect(mass.doc, `${adresse.name}: ${mass.schuldige.join(" | ")}`).toBeLessThanOrEqual(
          mass.vw,
        );

        /*
         * ERST NACHWEISEN, DASS ES ETWAS ZU TREFFEN GIBT — je Adresse, nicht
         * einmal fuer alle drei. Die Selbstmutation (Schwelle 44 → 60) fiel auf
         * der ERSTEN Adresse und brach die Schleife ab; fuer die beiden
         * folgenden war damit gar nicht belegt, dass die Kehrmenge nicht leer
         * ist. Und der Fall ist real: stuende die Zeile von `/s/<id>` auf
         * `scanning`, waere `files-freigabe` weiterhin sichtbar, es gaebe keinen
         * einzigen Knopf, und die Zusicherung darunter ginge muehelos durch.
         */
        const zielzahl = await page.locator("a[href], button").count();
        expect(
          zielzahl,
          `${adresse.name}: kein Bedienelement gefunden — die 44px-Zusicherung misst nichts`,
        ).toBeGreaterThan(0);

        const klein = await zuKleineZiele(page);
        expect(klein, `${adresse.name}: Trefferflaechen unter 44px`).toEqual([]);

        if (adresse.feldPflicht) {
          /*
           * ERST NACHWEISEN, DASS ES ETWAS ZU MESSEN GIBT. Eine leere Menge
           * erfuellt „alle Felder sind mindestens 16px" muehelos — und genau so
           * wird eine Zusicherung still wertlos, wenn ein Feld spaeter
           * verschwindet.
           */
          const felder = page.locator(
            "input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea",
          );
          expect(
            await felder.count(),
            `${adresse.name}: kein Eingabefeld gefunden — die 16px-Zusicherung misst nichts`,
          ).toBeGreaterThan(0);
        }
        const schrift = await zuKleineSchrift(page);
        expect(schrift, `${adresse.name}: Eingabefelder unter 16px`).toEqual([]);
      }
    });

    test(`5 — die Kopfzeile passt bei ${vp.breite}px in die Viewportbreite`, async ({ page }) => {
      sorgeFuerBestand();
      await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

      for (const pfad of ["/", "/posteingang"]) {
        const antwort = await page.goto(`${V}${pfad}`);
        expect(antwort?.status(), `${pfad}: HTTP`).toBe(200);
        await page.waitForLoadState("networkidle");

        /*
         * DIE KOPFZEILE SELBST, nicht nur das Dokument. Eine Mindestbreite ueber
         * der Viewportbreite ist der Defekt, den das Band 768–903 auf
         * Teilprojekt C hatte (`min-width: 904px`) — bei 390 unsichtbar, weil
         * die Modulnavigation dort ausgeblendet ist, und bei 1280 unsichtbar,
         * weil dort Platz ist. `scrollWidth` UND die gerenderte Breite: die
         * eine sieht den ueberlaufenden Inhalt, die andere den zu breiten
         * Kasten.
         */
        const kopf = await page.getByTestId("suite-header").evaluate((el) => ({
          breite: Math.round(el.getBoundingClientRect().width),
          scrollWidth: el.scrollWidth,
          vw: window.innerWidth,
        }));
        expect(kopf.breite, `${pfad}: Kopfzeile ${JSON.stringify(kopf)}`).toBeLessThanOrEqual(
          kopf.vw,
        );
        expect(kopf.scrollWidth, `${pfad}: Kopfzeile ${JSON.stringify(kopf)}`).toBeLessThanOrEqual(
          kopf.vw,
        );

        const mass = await ueberlauf(page);
        expect(mass.doc, `${pfad}: ${mass.schuldige.join(" | ")}`).toBeLessThanOrEqual(mass.vw);
      }
    });
  });
}
