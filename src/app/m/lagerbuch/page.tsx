import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "./_lib/host";
import {
  viewerOderNull, istLagerbuchAdmin, adminLandingPfad, verwaltungsZiel,
} from "./_lib/zugang";
import { absenderAus } from "./_lib/absender";
import { gateGesperrt } from "./_lib/gateSchranke";
import { gateMeldung } from "./_lib/gateTexte";
import { sanitizeReturnTo } from "./_lib/returnTo";
import { OeffentlicherRahmen } from "./_ui/OeffentlicherRahmen";
import { Gate } from "./_ui/Gate";

/**
 * DAS GATE — §7.2.4. Die Reihenfolge im Rumpf ist BINDEND.
 *
 * Es liegt auf der MODULWURZEL, nicht unter `/gate` — 1:1-Pflicht, weil jedes
 * `returnTo` und jeder Rueckfall der Cordon-Logik dorthin zeigt
 * (`cordon.ts:17,65`). Es ist zugleich die einzige Datei, die auf
 * `/m/lagerbuch` aufloest (§2.1 b).
 */
export const dynamic = "force-dynamic";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; grund?: string }>;
}) {
  const kopf = await headers();
  requireLagerbuchHost(kopf);                         // §2.6 — erste Anweisung
  const { returnTo, grund } = await searchParams;

  // PRAEDIKAT, KEIN RIEGEL (§3.2.1). `requireLagerbuchAdmin()` waere hier
  // falsch: es wuerfe jede Person OHNE Sitzung nach `/login` — also genau die
  // Helferin, fuer die diese Seite gebaut ist. DREI GUELTIGE FAELLE, NICHT
  // EINER:
  //   1. keine Sitzung        → Gate (der Regelfall)
  //   2. angemeldet + Gruppe  → Verwaltung
  //   3. angemeldet OHNE Gruppe → bleibt HIER stehen und sieht Zahlenfeld UND
  //      Verwaltungsknopf. Der hingenommene Preis aus §11.7.
  if (istLagerbuchAdmin(await viewerOderNull())) redirect(adminLandingPfad(returnTo));

  // Die Sekundenzahl fuer `grund=zuviele` (§3.9) wird NICHT ueber die URL
  // getragen. Drei Gruende, und der dritte traegt allein:
  //   * eine Zahl in der URL ist beim ersten Neuladen GELOGEN;
  //   * ein `searchParams`-Wert ist Nutzereingabe und muesste ohnehin verworfen
  //     und neu ermittelt werden;
  //   * diese Seite hat DIESELBEN Absender-Kopfzeilen wie die eben abgewiesene
  //     Anfrage — sie fragt die Schranke mit demselben Schluessel und bekommt
  //     dieselbe Antwort, OHNE dass irgendetwas transportiert werden muss.
  //
  // ⚠️ SIE LIEST NUR UND BUCHT NICHTS. Ein `gateFehlversuchBuchen` hier machte
  // das Neuladen des Gates zu einem Fehlversuch, und eine gesperrte Person kaeme
  // durch blosses Warten nie wieder herein. Der Aufruf steht HINTER dem
  // Host-Riegel und ohne Datenbankzugriff (§3.5.3).
  const sperrSekunden = gateGesperrt(absenderAus(kopf));
  const meldung = gateMeldung(grund, sperrSekunden);   // §3.9 — die EINE Textquelle

  const sauber = sanitizeReturnTo(returnTo);

  /**
   * DER VERWALTUNGSLINK WIRD HIER GEBAUT, NICHT IN DER INSEL (§3.6.6,
   * Entscheidung 15 a): „der Verwaltungs-Knopf fuehrt auf das Suite-/login".
   *
   * `verwaltungsZiel(kopf)` (Teil 2, T23, `_lib/zugang.ts:205-213`) NIMMT DIE
   * KOPFZEILEN — Protokoll, Host und Port kommen aus der Anfrage, nicht aus
   * einem Literal. Ein verdrahteter Prod-Host waere in Dev und E2E schlicht
   * falsch: `prodHosts` von `lagerbuch` ist in `core/registry.ts:103-105`
   * bewusst leer, der E2E-Host heisst `lagerbuch.localtest.me`, und der
   * Dev-Login nimmt einen absoluten `callbackUrl` nur an, wenn er die EIGENE
   * Origin trifft. Das Ziel MUSS zugleich absolut sein: ein relatives
   * `/m/lagerbuch/verwaltung` setzte die verwaltende Person auf dem PORTAL-Host
   * ab, weil `AUTH_URL` suiteweit derselbe Wert ist
   * (`core/auth/redirect.ts:8-18`), und entwertete den ganzen returnTo-Apparat.
   *
   * Ein `returnTo` (gescanntes Regaletikett) ersetzt nur den PFAD, nie den
   * Host: der wird aus `verwaltungsZiel(kopf)` uebernommen und NIE geraten.
   *
   * ⚠️ DIE WEICHE HAENGT AN DER ABSOLUTHEIT, NICHT AM PROTOKOLLNAMEN. Eine
   * Abfrage auf `https://` allein griffe im gesamten Dev- und E2E-Betrieb
   * daneben — dort liefert `verwaltungsZiel` ein `http:`-Ziel
   * (`_lib/zugang.test.ts:265`). Und der `else`-Zweig baut NICHTS Eigenes: ein
   * handgeknuepftes `/m/lagerbuch${sauber}` waere genau der relative Rueckfall,
   * den `_lib/zugang.ts:176-179` ausdruecklich gestrichen hat („KEIN RELATIVER
   * RUECKFALL MEHR — er trug nicht"), an einer zweiten Stelle neu erfunden.
   * Bleibt das Ziel nicht absolut, ist es der DEFINIERTE Wert der Funktion fuer
   * einen Zustand, der hinter `requireLagerbuchHost` unerreichbar ist — und er
   * wird UNVERAENDERT weitergereicht.
   *
   * `/login` liegt in `PASSTHROUGH` (`core/routing.ts:12`) und wird auf keinem
   * Host in ein Modul umgeschrieben.
   */
  const ziel = verwaltungsZiel(kopf);
  const callback = sauber && /^https?:\/\//.test(ziel) ? new URL(sauber, ziel).toString() : ziel;

  return (
    <OeffentlicherRahmen>
      <Gate
        meldung={meldung}
        returnTo={sauber ?? ""}
        verwaltungsLink={`/login?callbackUrl=${encodeURIComponent(callback)}`}
      />
    </OeffentlicherRahmen>
  );
}
