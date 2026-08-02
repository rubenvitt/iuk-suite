/**
 * DIE INBOX-WURZEL — EIN Inhalt, ZWEI Adressen (Spec §3.5, §8.1).
 *
 * Gerendert von `/` auf dem Inbox-Host (dem Rollen-Verteiler `page.tsx`) UND von
 * `(oeffentlich-inbox)/u/page.tsx`. Zwei Adressen, weil `drop` beide bediente und
 * die 1:1-Pflicht fuer verteilte Links gilt; EIN Inhalt, weil zwei Kopien
 * desselben Absatzes der Anfang der Drift sind.
 *
 * KEIN EINGABEFELD FUER DEN TOKEN, und das ist eine Entscheidung, keine Luecke
 * (§8.1): es gaebe nichts zu pruefen, was der Link nicht besser prueft, und ein
 * Feld waere ein Rateweg gegen einen anonymen Schreibzugang. Deshalb steht hier
 * auch der Weg zum richtigen Link statt einer Eingabemoeglichkeit.
 *
 * KEIN antd, KEIN Request-Zustand, KEIN `async`: der Rahmen
 * (`OeffentlicherRahmen`) traegt Fahne, Blatt und Kicker, diese Datei nur den
 * Text. Damit ist die RSC-Compound-Falle hier strukturell ausgeschlossen und die
 * Komponente aus einem Vitest heraus montierbar.
 *
 * Die Klassen kommen aus `_ui/files-public.css`, das der Rahmen mitbringt — nicht
 * aus einem eigenen `*.module.css`: es gibt hier keine Regel, die nicht schon
 * eine oeffentliche Ansicht des Moduls braucht.
 */
export function InboxStart() {
  return (
    <div data-testid="files-inbox-start">
      <h1 className="fp-titel">Dateien abgeben</h1>
      <p className="fp-text">
        Eine Abgabe ist nur über den Link oder den QR-Code möglich, den Sie
        erhalten haben.
      </p>
      <p className="fp-meta">
        Kein Link zur Hand? Bitte wenden Sie sich an die Stelle, die die Abgabe
        angefordert hat — sie kann Ihnen einen neuen Link geben.
      </p>
    </div>
  );
}
