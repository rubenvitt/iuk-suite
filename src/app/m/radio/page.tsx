// src/app/m/radio/page.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpAus } from "@/core/ratelimit";
import { getDb } from "./_db/client";
import { ausleihZugangOderNull } from "./_lib/ausleihZugang";
import { gateGesperrt } from "./_lib/gateSchranke";
import { gateMeldung } from "./_lib/gateTexte";
import { requireRadioHost } from "./_lib/host";
import { sanitizeReturnTo } from "./_lib/returnTo";
import { GateFormular } from "./_ui/GateFormular";
import s from "./_ui/ausleihe.module.css";

/**
 * DIE WEICHE GATE-ODER-AUSLEIHE — der aeussere Pfad `/` (Spec §1.2.1 Zeile 277,
 * §3.3.5 Zeilen 2400-2419, §3.5.5 Zeile 2767).
 *
 * ⛔ SIE LIEGT AUSSERHALB VON `(ausleihe)/`, und das ist keine Ordnungsfrage (Entscheidung
 * E1, `.superpowers/sdd/planteil3/briefs/KOPF.md:416-443`). Zwei unabhaengige Gruende:
 * `src/app/m/radio/page.tsx` und `(ausleihe)/page.tsx` loesten BEIDE auf `/m/radio` auf —
 * eine Route-Group aendert die URL nicht, und Next lehnt das beim Build ab. Und laege `/`
 * unter `(ausleihe)/layout.tsx`, das `requireAusleihZugang` ruft, liefe die Anfrage im
 * Kreis: jene leitet bei fehlendem Cookie auf `/` um (`_lib/ausleihZugang.ts:239`).
 *
 * ⛔ RIEGELFORM, VERBINDLICH (§3.5.5, Spec:2767): `requireRadioHost(await headers())` UND
 * `ausleihZugangOderNull(getDb())` — NIEMALS `requireAusleihZugang`. Auf DIESER Seite ist
 * „kein Zugang" der REGELFALL (Spec:2407): das Praedikat leitet nicht um und loescht
 * nichts, sonst liefe ein gesperrter Code in eine 303-Runde statt ins Codefeld.
 * `riegel.test.ts` Klausel (f) haelt beide Haelften und die Reihenfolge fest.
 *
 * ⚠️ DER HOST-RIEGEL STEHT HIER ZUSAETZLICH, obwohl `ausleihZugangOderNull` ihn INTERN als
 * ersten Schritt ruft (`_lib/ausleihZugang.ts:120`). Das ist die eine angeordnete Ausnahme
 * von Pflicht 16 („kein zweiter Aufruf"), ausgeschrieben in `_lib/ausleihZugang.ts:104-113`
 * und in `_lib/host.ts:114-116`: Route-Group-Grenzen sind keine Sicherheitsgrenzen, und die
 * tragende Zusage sind die aufrufbaren Funktionen (Spec:2759-2763).
 *
 * ⛔ KEINE `<Shell>` (Entscheidung E9, `KOPF.md:629-636`) und KEIN `AusleihRahmen`: der
 * Rahmen traegt Sitzungsetikett und Fussnavigation, und beides setzt eine Sitzung voraus,
 * die am Gate gerade fehlt. Er entsteht in A16.
 *
 * ⛔ DIES IST EINE SERVER COMPONENT: kein `Typography.Title`, kein `Form.Item`, kein
 * `Input.TextArea` (Falle 1, `CLAUDE.md:11-13`) — die Ueberschrift ist ein nacktes `<h1>`.
 * Kein `@ant-design/icons`, in keiner Datei dieses Moduls (Falle 7, `CLAUDE.md:31-44`,
 * Entscheidung E5).
 */

/**
 * ⛔ Die Seite liest Cookies und Kopfzeilen; ein statisch vorgerendertes Gate zeigte allen
 * dieselbe Antwort. §4.7 (Spec:3827) setzt dasselbe fuer die drei Ausleihseiten.
 */
export const dynamic = "force-dynamic";

export default async function RadioGatePage({
  searchParams,
}: {
  searchParams: Promise<{ grund?: string; returnTo?: string }>;
}) {
  const kopf = await headers();
  requireRadioHost(kopf);

  /*
   * DIE WEICHE. Mit gueltigem Zugang gehoert die Person nicht aufs Gate, sondern auf die
   * Uebersicht — die liegt bei `radio` an `/geraete` und NICHT an `/` (Entscheidung E1;
   * `_lib/routen.ts:30-37` fuehrt beide Pfade als eigene Rewrite-Ziele).
   *
   * ⚠️ UEBERHOLT UND HIER BERICHTIGT (Fix-Runde 2 zu T4, Fund N1): der fruehere Wortlaut hiess
   * „`/geraete` hat heute noch keine Datei" — `e80808cf` hat sie gebaut, und `radio.localtest.me/geraete`
   * antwortet gemessen 200. `_lib/routen.test.ts:15-19` bleibt richtig: sie sichert den REWRITE zu.
   *
   * ⛔ NICHT IN EINEM `try`/`catch`. `redirect()` arbeitet ueber einen geworfenen Sentinel;
   * ein `catch` verschluckt ihn, und die Weiterleitung findet STILL nicht statt
   * (Bauform-Zulaessigkeitstafel Zeile 6, `KOPF.md:347`).
   */
  const zugang = await ausleihZugangOderNull(getDb());
  if (zugang) redirect("/geraete");

  /*
   * ⛔ HIER STAND BIS ZUM 2026-08-27 EIN LINK „Zur Verwaltung" (`darfVerwalten && …`, frueher
   * `:125-126` und `:151-157`). ER WAR TOT DURCH KONSTRUKTION, NICHT FALSCH EINSORTIERT —
   * und die zwei Zeilen darueber sind der Grund. `befund` gibt JEDER Suite-Sitzung
   * `{ weg: "suite" }`, OHNE jede Gruppenpruefung (`_lib/ausleihZugang.ts:148-152`, Auflage 5
   * `:138-143`); `viewerOderNull()` las DIESELBE Sitzung ueber DASSELBE Symbol
   * (`_lib/ausleihZugang.ts:9` importiert `viewerAusSession` aus `./zugang`, definiert in
   * `_lib/zugang.ts:71`). War der Viewer also nicht `null`, hatte `redirect("/geraete")` die
   * Anfrage laengst weitergeschickt: der Zweig konnte in KEINEM erreichbaren Zustand wahr
   * werden. Sein Testfall war gruen ueber einem unmoeglichen Zustand — er mockte die beiden
   * Quellen unabhaengig voneinander.
   *
   * ⛔ UND ES KEHRT AUCH NICHT ALS RIEGEL ZURUECK — die Begruendung, die frueher an der
   * geloeschten Praedikatszeile stand, gilt unveraendert: ein `requireRadioAdmin()` oder
   * `requireRadioVerwaltung()` an dieser Stelle schickte JEDEN anonymen Scan nach `/login`,
   * bevor die Person das Gate je saehe — genau der Ausfall, den `requiresAuth: false`
   * verhindern soll (NS-Z6), und er waere typkorrekt, lint-sauber und fuer `pnpm build`
   * unsichtbar. `riegel.test.ts` Klausel (f) weist beide Namen auf DIESER Datei ab.
   *
   * ⛔ UND DIE UMSTELLUNG DER REIHENFOLGE IST NICHT DIE REPARATUR, so nahe sie liegt.
   * `src/app/m/lagerbuch/page.tsx:41` darf seine Weiche vor alles ziehen, WEIL dort ein
   * `redirect` folgt. Zoege man sie hier nach vorn und liesse einen LINK folgen, faende die
   * Weiterleitung nach `/geraete` fuer Verwaltende nicht mehr statt: eine Person, die gerade
   * ein Funkgeraet ausleihen will, landete im Codefeld statt im Bestand — woertlich der
   * Schaden, gegen den §3.6.3 Punkt 3 steht (Spec:2914-2924), nur mit umgekehrtem
   * Vorzeichen. Ausgeschrieben in `.superpowers/sdd/BERICHT-urls-und-adminzugang.md` §2.10
   * („Das Gate ist der falsche Ort — die Umstellung der Reihenfolge repariert es NICHT")
   * und als Posten 7 derselben Datei.
   *
   * ✅ DER WEG IN DIE VERWALTUNG GEHOERT IN DEN KOPF DER AUSLEIHFLAECHE — dorthin, wo der
   * Bestand ihn selbst verortet (`_lib/zugang.ts:505-507`: „am /admin-Link der
   * Ausleihflaeche") und wo eine verwaltende Person nach dieser Weiterleitung tatsaechlich
   * steht: `_ui/AusleihRahmen.tsx`, neben dem dort schon vorhandenen, praedikatsgebundenen
   * Link „Zur Suite" (`:153-156`). ⛔ WER IHN HIER WIEDER EINSETZT, BAUT DENSELBEN TOTEN
   * ZWEIG NEU — der Block „Bauform des Gates" in `page.test.tsx` haelt das fest.
   */

  const { grund, returnTo } = await searchParams;

  /*
   * ⛔ DER GRUND WANDERT UEBER DIE URL, DIE ZAHL NICHT (Spec:2391-2394). Diese Seite hat
   * DIESELBEN Absender-Kopfzeilen wie die eben abgewiesene Anfrage; sie fragt die Schranke
   * mit demselben Schluessel und bekommt dieselbe Antwort, ohne dass irgendetwas
   * transportiert werden muss. Eine Zahl aus der URL waere beim ersten Neuladen gelogen
   * und obendrein Nutzereingabe.
   *
   * ⛔ SIE LIEST NUR UND BUCHT NICHTS. Ein `gateFehlversuchBuchen` an dieser Stelle machte
   * das blosse Neuladen des Gates zu einem Fehlversuch, und eine gesperrte Person kaeme
   * durch Warten nie wieder herein (`_lib/gateSchranke.ts:215-222` bucht nur auf dem
   * Fehlerpfad des Einloesens).
   *
   * ⛔ NUR BEI `grund === "zuviele"`. `gateMeldung` ignoriert `sperrSekunden` fuer jeden
   * anderen Text (`_lib/gateTexte.ts:105`, umgesetzt `:112`); ein Aufruf der Schranke bei jedem
   * Gate-Abruf waere Arbeit ohne Wirkung. Die Typpruefung des Wertes macht `gateMeldung`
   * ueber `istGateGrund` selbst — ⛔ ausdruecklich OHNE Rueckfalltext: ein unbekannter
   * `grund` ergibt `null`, und die Seite zeigt dann KEINE Meldung (Spec:2396-2398).
   */
  const sperrSekunden = grund === "zuviele" ? gateGesperrt(clientIpAus(kopf)) : null;
  const meldung = gateMeldung(grund, sperrSekunden);

  /*
   * ⛔ `?returnTo=` GEHOERT DAZU, auch wenn der Aufgabenbrief nur `?grund=` aufzaehlt:
   * `t/[code]/route.ts:92-100` schreibt ihn auf die Gate-URL und schreibt daneben
   * „⛔ DAS GATE LIEST IHN (Spec:2400-2419)". Ohne diese Zeile faellt das gescannte
   * Regaletikett zwischen Handeingabe und Weiterleitung still auf den Boden.
   * `sanitizeReturnTo` laesst nur lokale Pfade durch (`_lib/returnTo.ts:52-60`) — der Wert
   * landet ueber `einloesenAmGate` in einem `Location`-Kopf, wo keine React-Entkommung
   * schuetzt (Spec:2417-2419).
   */
  const sauberesZiel = sanitizeReturnTo(returnTo);

  return (
    <main className={s.gate}>
      <h1 className={s.titel}>Funkgeräte</h1>
      <p className={s.hinweis}>
        Scanne den QR-Code auf dem Aufsteller oder gib den Zugangs-Code von Hand ein. Kein
        Konto, kein Passwort.
      </p>
      {/*
        ⚠️ DIE MELDUNG GEHT IN DIE INSEL, NICHT DANEBEN — und das ist eine ausgesprochene
        Abweichung vom Wortlaut des Briefs (`briefs/A11.md:180`), die den Brief erfuellt
        statt ihn zu brechen: er reicht denselben Satz als `fehlerText` an `GateFormular`
        weiter, und ein zweiter Aufdruck hier waere ein ZWEITER Fehlerort. Der Bestand
        schreibt aus, warum das ein Defekt waere: „Zwei Fehlerorte waeren zwei Zustaende,
        die einander widersprechen koennen" (`src/app/m/lagerbuch/_ui/Gate.tsx:22-25`) —
        etwa ein `?grund=code` aus der URL neben einem frischeren Satz der Action. Die
        Live-Region traegt die Insel (`_ui/GateFormular.tsx:148`); sie wird serverseitig
        mitgerendert, der Satz steht also auch ohne JavaScript im HTML. ⚠️ SIE TRAEGT
        `role="alert"` UND NICHT das `role="status" aria-live="polite"` des Briefs
        (`briefs/A11.md:180`) — entschieden in der Fix-Runde 1 zu A11 (REVIEW-A11, Fund
        W3), begruendet an der Zeile selbst und im Bestand
        (`src/app/m/lagerbuch/_ui/Gate.tsx:187-188`).
      */}
      <GateFormular fehlerText={meldung} returnTo={sauberesZiel ?? ""} />
    </main>
  );
}
