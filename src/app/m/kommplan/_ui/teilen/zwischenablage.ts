/**
 * KOPIEREN AUCH ÜBER HTTP (Entscheidung 17, Review Focus 3): `navigator.clipboard` gibt es nur im sicheren Kontext
 * (HTTPS, `localhost`) — im LAN über `http://<ip>` und auf `*.localtest.me` fehlt es. Dann ein unsichtbares Textfeld
 * mit `execCommand("copy")` (veraltet, aber in allen Browsern vorhanden und im Klick erlaubt); der Fokus kehrt
 * danach dorthin zurück, wo er war. Scheitert beides: „manuell" — der Aufrufer zeigt den Link markiert. Nie ein Wurf.
 */
export async function kopiere(text: string): Promise<"kopiert" | "manuell"> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return "kopiert";
    }
  } catch { /* weiter mit dem Rückfall */ }
  const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const feld = document.createElement("textarea");
  feld.value = text;
  feld.setAttribute("readonly", "");
  feld.setAttribute("aria-hidden", "true");
  Object.assign(feld.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(feld);
  try {
    feld.focus({ preventScroll: true }); // `select()` allein fokussiert nicht überall — execCommand kopiert die Auswahl im FOKUSSIERTEN Feld
    feld.select();
    return document.execCommand("copy") ? "kopiert" : "manuell";
  } catch {
    return "manuell";
  } finally {
    feld.remove();
    vorher?.focus();
  }
}
