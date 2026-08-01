import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ladeShare, type ShareDatei, type ShareInhalt, type ShareKopf } from "../../../_db/queries";
import { grenzen } from "../../../_lib/grenzen";
import { langerZeitpunktBerlin } from "../../../_lib/zeit";
import { PasswortMaske } from "../../../_ui/PasswortMaske";
import { vorschauZustand } from "../../../api/preview/[id]/route";
import s from "./share.module.css";

/**
 * DIE OEFFENTLICHE FREIGABE-ANSICHT `/s/<id>` (Spec §7.4, §7.7, §10.1; Plan T40).
 *
 * ═══ DAS GATE IST DIESE SERVER-KOMPONENTE, NICHT DIE MASKE ═══════════════════
 *
 * Ist ein Passwort gesetzt und kein gueltiges Cookie da, ENTSTEHT das Markup der
 * Dateiliste gar nicht erst: die Funktion kehrt vorher zurueck. Die Alt-Seite
 * laedt die Dateien, BEVOR sie das Passwort prueft, und uebergibt die fertigen
 * Ansichten als `children` an eine Client-Komponente — Dateinamen, Groessen,
 * Beschreibung und die fertigen Download-Adressen stecken damit im RSC-Payload
 * DERSELBEN Antwort, die die Passwortmaske zeigt (Analyse Falle 12). Genau
 * deshalb ist die Reihenfolge hier eine Zusage und keine Bequemlichkeit, und
 * genau deshalb kann ein Vitest sie nicht besitzen: dort ist `"use client"` ein
 * wirkungsloser String, es gibt keinen Payload, und der Unterschied waere
 * unsichtbar. Die Wirkung belegt `e2e/files-fileshare.spec.ts` am rohen Body.
 *
 * ═══ KEINE PRUEFKETTE IN DIESER DATEI ════════════════════════════════════════
 *
 * `ladeShare` ist die EINE Ladefunktion mit der EINEN Reihenfolge (Existenz →
 * Ablauf → Passwort-Cookie → AV → Limit, §7.4). Diese Seite bildet nur
 * Zustandsnamen auf Ansichten ab. Sie zaehlt auch nichts hoch: das verbrauchende
 * `UPDATE` laeuft ausschliesslich in `download` und `zip` (§7.5) — beim Rendern
 * dieser Seite waere ein Share mit `max_downloads = 3` nach drei fremden
 * Seitenaufrufen tot.
 *
 * ═══ EINE NEXT-SEITE KANN KEINEN 410 SETZEN ══════════════════════════════════
 *
 * Nur ein Route Handler kann das. Deshalb — als FESTLEGUNG, damit niemand es
 * „repariert" und die Seite in einen Route Handler umbaut — antwortet `/s/<id>`
 * mit HTTP 200 und einer eindeutigen Zustandsseite, waehrend die Byte-Wege 410
 * liefern (§7.4-Tabelle).
 *
 * ═══ DIESE ANSICHT IST EINE SACKGASSE, UND ZWAR ABSICHTLICH ══════════════════
 *
 * Kein „Zurueck", kein Link in die Verwaltung, kein App-Switcher: sie wird
 * anonym auf einem fremden Handy geoeffnet, und jeder Verwaltungsweg waere fuer
 * die aufrufende Person eine Sackgasse hinter einem 404 (Prueffrage aus
 * `docs/design/README.md:236-242`). Rolle und Rahmen kommen aus
 * `(oeffentlich-share)/layout.tsx`; ein zweiter Riegel hier waere derselbe an
 * der falschen Stelle.
 *
 * KEIN antd auf dieser Route (Gestaltungsklasse „oeffentlich"). Damit ist die
 * RSC-Compound-Falle hier strukturell ausgeschlossen.
 */

/**
 * KEIN Zwischenspeicher. Die Ansicht haengt an einem Cookie und an
 * AV-Zustaenden, die sich waehrend des Wartens aendern — eine
 * zwischengespeicherte Antwort zeigte die Maske einer bereits entsperrten
 * Sitzung oder den Wartezustand einer laengst freigegebenen Datei. Das Layout
 * ruft zwar `headers()` und macht das Segment damit dynamisch; auf diesen
 * Nebeneffekt eines FREMDEN Riegels soll die Zusage nicht hoerbar angewiesen
 * sein.
 */
export const dynamic = "force-dynamic";

/** Der Satz, der bei jedem Zustand steht, aus dem es fuer den Empfaenger
 *  allein keinen Weg mehr gibt. EINE Formulierung, nicht vier. */
const WENDEN_SIE_SICH =
  "Bitte wenden Sie sich an die Person, die Ihnen den Link gegeben hat.";

const BYTE_EINHEITEN_BINAER = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

/**
 * Binaere Einheiten, weil jede Grenze dieses Moduls binaer gerechnet ist
 * (`_lib/grenzen.ts`): eine Anzeige in MB neben einer Grenze in MiB laesst
 * dieselbe Datei einmal unter und einmal ueber der Schwelle aussehen — die
 * 1,048576-Falle aus §9.1 in ihrer harmlos aussehenden Gestalt.
 */
function byteText(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < BYTE_EINHEITEN_BINAER.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${BYTE_EINHEITEN_BINAER[stufe]}`;
}

/*
 * MIT FESTER ZEITZONE — diese Seite hatte sie als EINZIGE im Modul von Anfang
 * an. Ohne `timeZone` formatiert `Intl` in der Zone des SERVERPROZESSES; im
 * Container ist das UTC, und der Empfaenger auf einem fremden Handy laese die
 * Ablaufstunde um eine (im Sommer zwei) daneben. Genau das ist die einzige
 * Zahl auf dieser Seite, nach der er sich richtet.
 *
 * Der Formatierer stand bis 2026-08-01 hier und ist nach `_lib/zeit.ts`
 * gezogen — nicht weil er falsch war, sondern damit es EINE Stelle gibt: die
 * fuenf anderen Ansichten des Moduls hatten die Zone NICHT gesetzt, und eine
 * Zusage, die an einer von sechs Stellen richtig steht, ist keine. Der
 * angezeigte Text dieser Seite aendert sich dadurch nicht.
 */

/**
 * Der Zustand EINER Zeile — Text plus Symbol, nie Farbe allein
 * (`docs/design/README.md:133-137`), und `hinweis` genau dort, wo es fuer den
 * Empfaenger nicht weitergeht.
 *
 * DIE REIHENFOLGE DER FRAGEN IST DIE DER PRUEFKETTE (`_db/queries.ts`, Stufe 4):
 * vollstaendig → freigegeben → Blob. Eine andere Reihenfolge zeigte bei einer
 * gesperrten Datei ohne Blob „nicht auffindbar" — und damit einen anderen Grund,
 * als der Byte-Weg mit seinem 403 nennt.
 */
function zeilenZustand(datei: ShareDatei): {
  text: string;
  symbol: string;
  klasse: string;
  hinweis: boolean;
} {
  if (!datei.vollstaendig)
    return {
      text: "wird noch übertragen",
      symbol: "↑",
      klasse: "fp-zustand",
      hinweis: false,
    };

  if (!datei.freigegeben) {
    if (datei.avStatus === "scanning")
      return {
        text: "wird geprüft",
        symbol: "⏳",
        klasse: "fp-zustand fp-zustand-wartet",
        hinweis: false,
      };
    if (datei.avStatus === "infected")
      return { text: "gesperrt", symbol: "⊘", klasse: "fp-zustand", hinweis: true };
    if (datei.avStatus === "error")
      return {
        text: "Prüfung nicht möglich",
        symbol: "⚠",
        klasse: "fp-zustand",
        hinweis: true,
      };
    // `unscanned` — der Altbestand aus dem Import. Er gibt NICHT frei
    // (`_lib/av.ts`), und ohne einen eigenen Namen saehe er wie „wird geprüft"
    // aus, obwohl niemand mehr prueft.
    return { text: "noch nicht geprüft", symbol: "⚠", klasse: "fp-zustand", hinweis: true };
  }

  if (datei.blobFehlt)
    return {
      text: "Diese Datei ist nicht auffindbar.",
      symbol: "⚠",
      klasse: "fp-zustand",
      hinweis: true,
    };

  return { text: "freigegeben", symbol: "✓", klasse: "fp-zustand fp-zustand-frei", hinweis: false };
}

function Zeile({
  shareId,
  datei,
  vorschauMaxBytes,
}: {
  shareId: string;
  datei: ShareDatei;
  vorschauMaxBytes: number;
}) {
  const zustand = zeilenZustand(datei);
  /*
   * DIESELBE FUNKTION, DIE DER HANDLER ANWENDET — nicht dieselbe Regel noch
   * einmal. `vorschauZustand` ist in `api/preview/[id]/route.ts` genau dafuer
   * exportiert (§10.2: Oberflaeche und Riegel wenden dasselbe Praedikat auf
   * denselben Gegenstand an). Eine nachgebaute Typliste zeigte den
   * Vorschau-Knopf irgendwann fuer etwas, das der Handler ablehnt — ein
   * Einstiegspunkt in eine Fehlerantwort.
   */
  const vorschau = datei.ladbar ? vorschauZustand(datei, vorschauMaxBytes) : null;

  return (
    <li className={s.eintrag} data-file-id={datei.id}>
      <p className={s.kopfzeile}>
        <span className={s.name}>{datei.dateiname}</span>
        {/* Bei fehlendem Blob steht der Zustand STATT einer Groesse: eine Zahl
            waere eine Zusicherung ueber Bytes, die es nicht gibt (§10.1). */}
        {!datei.blobFehlt && <span className={s.groesse}>{byteText(datei.groesse)}</span>}
      </p>

      <p className={`${zustand.klasse} ${s.zeilenzustand}`}>
        <span aria-hidden="true">{zustand.symbol}</span> {zustand.text}
      </p>

      {zustand.hinweis && <p className={s.zeilenhinweis}>{WENDEN_SIE_SICH}</p>}

      {datei.ladbar && (
        <p className="fp-knopfzeile">
          <a className="fp-knopf" href={`/api/download/${shareId}?file=${datei.id}`}>
            Herunterladen
          </a>
          {vorschau === "vorschau" && (
            <a
              className="fp-knopf fp-knopf-leise"
              href={`/api/preview/${shareId}?file=${datei.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Vorschau
            </a>
          )}
          {/* §7.7: ein halbes Bild ist keine Vorschau, also wird nicht gekappt,
              sondern abgelehnt — und der Zustand steht AN DER STELLE des
              Knopfes, sonst waere er nirgends sichtbar. */}
          {vorschau === "zu-gross-fuer-vorschau" && (
            <span className={`fp-zustand ${s.zuGross}`}>Zu groß für die Vorschau</span>
          )}
        </p>
      )}
    </li>
  );
}

/** Titel und benannter Zustand, sonst nichts — fuer „abgelaufen" und
 *  „Limit erreicht". Beide antworten mit HTTP 200 (§7.4). */
function Zustandsseite({ titel, satz }: { titel: string; satz: string }) {
  return (
    <div data-testid="files-freigabe-zustand">
      <h1 className="fp-titel">{titel}</h1>
      <div className={s.warten}>
        <p className="fp-text">{satz}</p>
      </div>
      <p className="fp-meta">{WENDEN_SIE_SICH}</p>
    </div>
  );
}

function Inhalt({
  share,
  inhalt,
  vorschauMaxBytes,
}: {
  share: ShareKopf;
  inhalt: ShareInhalt;
  vorschauMaxBytes: number;
}) {
  /*
   * DER GANZSEITIGE WARTEZUSTAND — genau EIN Fall (§7.4): keine Datei
   * freigegeben UND mindestens eine `scanning`.
   *
   * Das Praedikat ist `freigegeben`, NICHT `ladbar`. Eine `clean`-Zeile ohne
   * Blob ist freigegeben und nicht ladbar — sie hat etwas zu sagen („nicht
   * auffindbar"). Ueber `anzahlLadbar === 0` verschwaende diese Auskunft hinter
   * einer Wartemeldung, und der Empfaenger wartete auf etwas, das nie kommt.
   */
  const nichtsFreigegeben = !inhalt.dateien.some((d) => d.freigegeben);
  const ganzseitigWarten = nichtsFreigegeben && inhalt.mindestensEineWirdGeprueft;

  return (
    <div data-testid="files-freigabe">
      {/*
       * DIE SELBSTAKTUALISIERUNG, JS-FREI und auf GENAU diesen Zustand
       * begrenzt: `error` und `infected` sind Endzustaende und zaehlen in
       * `mindestensEineWirdGeprueft` nicht mit (`_db/queries.ts`). Ohne diese
       * Begrenzung laedt eine Seite mit einer dauerhaft fehlgeschlagenen Datei
       * alle 5 Sekunden nach — fuer immer, auf einem fremden Handy.
       */}
      {inhalt.mindestensEineWirdGeprueft && <meta httpEquiv="refresh" content="5" />}

      <h1 className="fp-titel">{share.titel}</h1>
      {share.beschreibung !== null && share.beschreibung !== "" && (
        <p className={`fp-text ${s.beschreibung}`}>{share.beschreibung}</p>
      )}
      <p className={`fp-meta ${s.randdaten}`}>
        Verfügbar bis {langerZeitpunktBerlin(share.ablaufAt)}
        {share.maxDownloads !== null &&
          ` · noch ${Math.max(0, share.maxDownloads - share.downloadCount)} von ${share.maxDownloads} Downloads`}
      </p>

      {inhalt.alleUnvollstaendig ? (
        <div className={s.warten}>
          <p className="fp-text">Diese Freigabe enthält noch keine übertragene Datei.</p>
          <p className="fp-meta">{WENDEN_SIE_SICH}</p>
        </div>
      ) : ganzseitigWarten ? (
        <div className={s.warten} data-testid="files-freigabe-warten">
          <p className="fp-text">
            Die Dateien werden gerade geprüft. Diese Seite aktualisiert sich von
            selbst.
          </p>
          <p className="fp-meta">
            Jede Datei wird vor der Freigabe auf Schadsoftware untersucht. Das
            dauert je nach Größe einige Sekunden.
          </p>
        </div>
      ) : (
        <>
          <ul className="fp-liste">
            {inhalt.dateien.map((datei) => (
              <Zeile
                key={datei.id}
                shareId={share.id}
                datei={datei}
                vorschauMaxBytes={vorschauMaxBytes}
              />
            ))}
          </ul>

          {/*
           * ABSICHTLICH OHNE GESAMTGROESSE. `inhalt.gesamtGroesse` summiert die
           * VOLLSTAENDIGEN Zeilen — auch die, deren Blob fehlt und die deshalb
           * direkt darueber „nicht auffindbar" tragen. Eine Summe, die Bytes
           * mitzaehlt, die es nicht gibt, widerspraeche der Zeile daneben; eine
           * eigene Summe ueber nur die ladbaren Zeilen waere eine ZWEITE
           * Definition derselben Menge, und genau daran laufen die beiden
           * Groessenangaben der Alt-App auseinander (`_db/queries.ts`). Die
           * Bytezahl steht je Zeile, wo sie stimmt.
           */}
          <p className="fp-meta">
            {inhalt.anzahlLadbar} von {inhalt.dateien.length}{" "}
            {inhalt.dateien.length === 1 ? "Datei" : "Dateien"} verfügbar
          </p>

          {/* Der ZIP-Weg nur, wenn er auch Bytes liefern kann: ein
              Einstiegspunkt, der in eine Fehlerantwort fuehrt, ist schlimmer
              als kein Einstiegspunkt (§10.2). */}
          {inhalt.anzahlLadbar > 0 && (
            <p className="fp-knopfzeile">
              <a className="fp-knopf fp-knopf-leise" href={`/api/download/${share.id}/zip`}>
                Alle Dateien als ZIP
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default async function FilesFreigabeSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kekse = await cookies();

  /*
   * EIN COOKIE-LESER, KEIN COOKIE-NAME. `cookieName()` WIRFT bei einer ID, die
   * kein Cookie-Name waere — und die ID kommt hier aus einem Pfadabschnitt.
   * Bildete diese Seite den Namen selbst, also VOR der Existenzstufe, waere
   * `/s/<unrat>` HTTP 500 statt der 404-Seite der Suite. Die Kette bildet ihn
   * erst aus der gefundenen Zeile.
   */
  const ladung = await ladeShare({
    shareId: id,
    cookieLeser: (name) => kekse.get(name)?.value,
  });

  switch (ladung.zustand) {
    case "unbekannt":
      // 404 und nicht „Freigabe existiert nicht": die Existenz einer ID wird
      // nicht bestaetigt (§7.4-Tabelle).
      notFound();

    case "abgelaufen":
      return (
        <Zustandsseite titel={ladung.titel} satz="Dieser Link ist abgelaufen." />
      );

    case "limitErreicht":
      return (
        <Zustandsseite
          titel={ladung.titel}
          satz="Die zulässige Zahl an Downloads ist erreicht."
        />
      );

    case "passwortNoetig":
      return (
        <div data-testid="files-freigabe-passwort">
          <h1 className="fp-titel">{ladung.titel}</h1>
          <p className="fp-text">
            Diese Freigabe ist mit einem Passwort geschützt. Sie haben es von der
            Person erhalten, die Ihnen den Link gegeben hat.
          </p>
          {/* Nur die KOMPONENTE aus dem Client-Modul, nie ein Wert von dort:
              eine Konstante kaeme als Client-Referenz an und ergaebe HTTP 500
              fuer die ganze Seite (Falle 6). */}
          <PasswortMaske shareId={id} />
        </div>
      );

    case "offen":
      return (
        <Inhalt
          share={ladung.share}
          inhalt={ladung.inhalt}
          vorschauMaxBytes={grenzen().vorschauMaxBytes}
        />
      );

    /*
     * DIE DREI ZUSTAENDE EINER GEWAEHLTEN DATEI. Sie sind von HIER aus
     * unerreichbar, weil diese Seite `dateiId` nicht setzt — sie gehoeren den
     * Byte-Wegen (403/404). Sie stehen trotzdem ausgeschrieben da: ein
     * `default: notFound()` schluckte auch einen kuenftigen sechsten Zustand,
     * den `ladeShare` einfuehrt, und die Seite antwortete stumm mit 404 auf
     * etwas, das eine Ansicht braucht. So meldet `pnpm typecheck` ihn.
     */
    case "gesperrt":
    case "blobFehlt":
    case "dateiNichtGefunden":
      notFound();
  }
}
