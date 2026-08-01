import { headers } from "next/headers";
import { requireFilesAccess } from "./_lib/access";
import { resolveRole } from "./_lib/hostRolle";
import { FILES_NAV } from "./_lib/nav";
import { InboxStart } from "./_ui/InboxStart";
import { OeffentlicherRahmen } from "./_ui/OeffentlicherRahmen";
import { SharesUebersicht } from "./_ui/SharesUebersicht";
import { VerwaltungsRahmen } from "./_ui/VerwaltungsRahmen";

/**
 * DER ROLLEN-VERTEILER — DIE EINZIGE DATEI, DIE AUF `/m/files` AUFLOEST
 * (Spec §3.5).
 *
 * `drop` bediente `/` mit einer Willkommensseite, `easy-filesharing` mit
 * `redirect("/dashboard")`. Unter der Suite rewriten BEIDE Hosts auf denselben
 * Pfad: `routing.ts:78` setzt fuer `/` `rest = ""`, also `/m/files` — ein
 * Handler, zwei Startseiten, und es gibt KEINEN Pfadunterschied, an dem Next
 * entscheiden koennte. Der Unterschied liegt im HOST, und deshalb liest diese
 * Seite `headers()`.
 *
 * ES GIBT KEINE `(verwaltung)/page.tsx`. Sie und diese Datei loesten beide auf
 * `/m/files` auf — Route-Groups erscheinen in keinem URL-Pfad —, und `next build`
 * bricht mit „You cannot have two parallel pages that resolve to the same path"
 * ab. Aus demselben Grund hat `feedback` kein `src/app/m/feedback/page.tsx`
 * neben `(admin)/page.tsx`.
 *
 * RIEGEL UND CHROME STEHEN HIER, NICHT NUR IM LAYOUT. Diese Datei liegt
 * auszerhalb aller Route-Groups (sie muss beide Rollen bedienen koennen), also
 * greift `(verwaltung)/layout.tsx` fuer sie NICHT — Next stapelt Layouts pro
 * Pfad-Segment. Haengen Guard und Shell allein dort, stuende die
 * Freigaben-Uebersicht auf der Modulwurzel UNGEGATET und ohne Navigation.
 * `requireFilesAccess()` wird deshalb von ZWEI Stellen gerufen; das ist kein
 * Duplikat, sondern das erprobte Muster „EINE Stelle, zwei Layouts"
 * (`feedback/_lib/requireFeedbackAccess.ts` — dort fiel die Druckansicht aus dem
 * Group-Layout heraus, hier die Wurzelseite).
 *
 * DIESE SEITE REDIRECTED NICHT. Ein Huepfer auf `/shares` bzw. `/u` ersetzte die
 * Erwartung „die Domain-Wurzel zeigt sofort etwas" durch eine zusaetzliche Runde
 * — auf der Inbox-Domain fuer ein Handy im Funkloch.
 *
 * `headers()` in einer Wurzelseite ist in dieser Suite ohne Praezedenzfall
 * (Analyse E2) und trotzdem folgenlos: `app/layout.tsx` liest bereits
 * `cookies()`, und `pnpm build` weist jede Route der Suite als `ƒ (Dynamic)` aus
 * — es gibt hier keine statisch gerenderte Route, die `headers()` erst dynamisch
 * machen koennte. Belegt wird es gemessen statt behauptet:
 * `e2e/files-hosts.spec.ts` ruft `/` auf BEIDEN Hosts auf und erwartet zwei
 * verschiedene Ansichten.
 */
export default async function FilesWurzel() {
  // `resolveRole` und nicht `rolleOderNull`: ein unbekannter Host ist hier ein
  // `notFound()` (die Form fuer Seiten und Layouts), kein selbstgebauter
  // Statuscode — den brauchen nur die Route Handler unter `api/`.
  const rolle = resolveRole(await headers());

  if (rolle === "inbox") {
    /*
     * ANONYM UND CHROME-LOS: kein `auth()`, keine Shell, kein App-Switcher. Ein
     * Switcher zeigte hier auf Module, die die aufrufende Person nicht betreten
     * darf — jeder Eintrag eine Sackgasse.
     *
     * `kicker` ist Pflicht und hat bewusst keine Vorbelegung: „Dateiabgabe"
     * gegen „Dateifreigabe" ist der Unterschied zwischen zwei Pfadraeumen, und
     * eine Vorbelegung waere die stille Variante davon, dass die Abgabeseite
     * sich als Freigabe ausgibt.
     */
    return (
      <OeffentlicherRahmen kicker="Dateiabgabe">
        <InboxStart />
      </OeffentlicherRahmen>
    );
  }

  // Der Rueckgabewert wird hier nicht gebraucht: die Uebersicht zeigt die
  // Freigaben ALLER Mitglieder, es gibt keine Ownership-Stufe (§2.4). Gerufen
  // wird `requireFilesAccess` trotzdem — es IST der Riegel dieser Seite, und
  // ohne ihn stuende die Uebersicht jedem Eingeloggten offen.
  await requireFilesAccess();

  return (
    <VerwaltungsRahmen nav={FILES_NAV}>
      <SharesUebersicht rolle={rolle} />
    </VerwaltungsRahmen>
  );
}
