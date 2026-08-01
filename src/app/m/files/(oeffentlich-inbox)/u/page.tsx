import { InboxStart } from "../../_ui/InboxStart";

/**
 * DIE INBOX-WURZEL UNTER `/u` (Spec §3.5, §8.1).
 *
 * DERSELBE Inhalt wie `/` auf dem Inbox-Host, und das ist Absicht: `drop` bediente
 * beide Adressen, und die 1:1-Pflicht gilt fuer alles, was verteilt oder gedruckt
 * ist. Der Verteiler `page.tsx` redirected NICHT hierher — ein Huepfer waere auf
 * einem Handy im Funkloch eine zusaetzliche Runde fuer nichts.
 *
 * Rolle und Rahmen kommen aus `(oeffentlich-inbox)/layout.tsx`; diese Datei traegt
 * NUR den Inhalt. Der Verteiler dagegen bringt Rahmen und Kicker selbst mit — er
 * liegt auszerhalb aller Route-Groups, das Layout greift fuer ihn nicht.
 *
 * KEIN EINGABEFELD fuer den Token: es gaebe nichts zu pruefen, was der Link nicht
 * besser prueft, und ein Feld waere ein Rateweg (§8.1). Deshalb ist diese Seite
 * statisch im Inhalt und braucht weder `params` noch `searchParams`.
 */
export default function FilesInboxWurzel() {
  return <InboxStart />;
}
