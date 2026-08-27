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
import { istRadioAdmin, viewerOderNull } from "./_lib/zugang";
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
 * und in `_lib/host.ts:80`: Route-Group-Grenzen sind keine Sicherheitsgrenzen, und die
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
   * ⚠️ ERWARTETER ZWISCHENZUSTAND ZWISCHEN A11 UND A18, kein Mangel: `/geraete` hat heute
   * noch keine Datei und ist damit eine saubere 404. `_lib/routen.test.ts:15-19` sichert
   * den REWRITE zu, nicht die Existenz einer Datei, und schreibt genau das aus.
   *
   * ⛔ NICHT IN EINEM `try`/`catch`. `redirect()` arbeitet ueber einen geworfenen Sentinel;
   * ein `catch` verschluckt ihn, und die Weiterleitung findet STILL nicht statt
   * (Bauform-Zulaessigkeitstafel Zeile 6, `KOPF.md:347`).
   */
  const zugang = await ausleihZugangOderNull(getDb());
  if (zugang) redirect("/geraete");

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

  /*
   * ⛔ EIN LINK, KEIN REDIRECT, UND ER HAENGT AM PRAEDIKAT (§3.6.3 Punkt 3 und 4,
   * Spec:2914-2924; NS-Z6). Spec §1.2.1 Zeile 277 schreibt „ein radio-admin wird nach
   * `/admin` geleitet"; §3.6.3 Punkt 3 STICHT: „Ein `radio`-Admin bekommt ueber
   * `weg: "suite"` Zugang zur Ausleihe — nicht als Admin." Ein Redirect wuerfe eine Person,
   * die gerade ein Funkgeraet ausleihen will, aus der Ausleihe heraus.
   *
   * ⛔ `istRadioAdmin(await viewerOderNull())`, NIEMALS `requireRadioAdmin()`. Der werfende
   * Riegel schickte JEDEN anonymen Scan nach `/login`, bevor die Person das Gate je saehe —
   * genau der Ausfall, den `requiresAuth: false` verhindern soll, und er waere typkorrekt,
   * lint-sauber und fuer `pnpm build` unsichtbar. `viewerOderNull` ruft den Host-Riegel
   * ihrerseits bewusst nicht (`_lib/zugang.ts:86-97`, Klausel (d) in `riegel.test.ts`).
   */
  const viewer = await viewerOderNull();
  const darfVerwalten = istRadioAdmin(viewer);

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
      {darfVerwalten && (
        <p className={s.adminZeile}>
          <a className={s.adminLink} href="/admin" data-rolle="gate-admin">
            Zur Verwaltung
          </a>
        </p>
      )}
    </main>
  );
}
