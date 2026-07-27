import { act, type ReactElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

/**
 * Mount-Hilfe fuer die Client-Komponenten des Moduls.
 *
 * Bewusst auf `react-dom/client` statt auf @testing-library/react: die
 * Bibliothek ist keine Abhaengigkeit dieses Projekts, und QrDisplay.test.tsx
 * faehrt bereits so. Die Hilfe liegt hier, weil sechs Testdateien sie brauchen —
 * sechsmal dieselben zwanzig Zeilen driften auseinander.
 *
 * Nur fuer Tests gedacht; `_lib` ist ein Next Private Folder und erzeugt keine
 * Route.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export async function mount(element: ReactElement): Promise<void> {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(element);
  });
}

/**
 * Wie `mount`, nur ueber den ECHTEN Hydrationsweg: erst das serverseitige HTML,
 * dann `hydrateRoot`. Damit — und nur damit — ist der Zustand pruefbar, in dem
 * eine Person das Formular BEDIENT, BEVOR das JavaScript da ist: `vorbereiten`
 * laeuft genau in diesem Fenster und darf am gelieferten HTML herumtippen.
 *
 * `renderToString` und nicht `renderToStaticMarkup`: letzteres liefert keine
 * Hydrationsmarken, React erkennt eine Abweichung und rendert den Baum NEU —
 * dabei geht jede Vorbereitung verloren, und der Test misst dann das Gegenteil
 * von dem, was er behauptet (empirisch belegt: `checked` faellt von 8 auf 0).
 */
export async function hydrate(
  element: ReactElement,
  vorbereiten?: (host: HTMLElement) => void,
): Promise<void> {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const created = document.createElement("div");
  created.innerHTML = renderToString(element);
  document.body.appendChild(created);
  host = created;
  vorbereiten?.(created);
  await act(async () => {
    root = hydrateRoot(created, element);
  });
}

/**
 * Denselben Baum erneut rendern — fuer Zusagen, die erst an einem UEBERGANG
 * sichtbar werden (z. B. „nach dem Serverergebnis steht das Feld wieder auf dem
 * Stand des Servers"). Ein zweites `mount` waere ein frischer Baum und wuerde
 * genau den Uebergang ueberspringen, um den es geht.
 */
export async function rerender(element: ReactElement): Promise<void> {
  const current = root;
  if (!current) throw new Error("Es ist nichts gemountet");
  await act(async () => {
    current.render(element);
  });
}

export async function unmount(): Promise<void> {
  const current = root;
  const currentHost = host;
  root = null;
  host = null;
  if (current) {
    await act(async () => {
      current.unmount();
    });
  }
  // antd haengt Portale (Drawer, Modal, Tooltip) direkt an document.body. Ohne
  // dieses Aufraeumen sieht der naechste Test die Reste des vorherigen und
  // `existsPortal` liefert falsche Treffer — ein Fehler, der als bestandener
  // Test daherkommt.
  for (const rest of Array.from(document.body.children)) {
    if (rest !== currentHost) rest.remove();
  }
  currentHost?.remove();
}

function container(): HTMLElement {
  if (!host) throw new Error("Es ist nichts gemountet");
  return host;
}

export function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = container().querySelector<T>(selector);
  if (!el) throw new Error(`Element nicht gefunden: ${selector}`);
  return el;
}

export function queryAll<T extends HTMLElement = HTMLElement>(selector: string): T[] {
  return Array.from(container().querySelectorAll<T>(selector));
}

export function exists(selector: string): boolean {
  return container().querySelector(selector) !== null;
}

/**
 * React haengt an den value-Setter der Eingabe einen eigenen Tracker. Eine
 * direkte Zuweisung liest der Tracker als "unveraendert", onChange bliebe aus
 * und das Feld waere im Test still leer. Deshalb ueber den Prototyp-Setter.
 *
 * Der Setter kommt aus dem Prototyp DES ELEMENTS, nicht fest aus
 * `HTMLInputElement`: jsdom prueft in seinen Settern die Herkunft von `this`
 * ("Illegal invocation"), der Input-Setter an einem `<textarea>` wuerde also
 * werfen. Ein Test der Freitextzeilen scheiterte sonst mit einer Meldung, die
 * nach Fehler im Harness und nicht nach Fehler im Feld aussieht.
 */
export async function fill(selector: string, value: string): Promise<void> {
  const input = query<HTMLInputElement | HTMLTextAreaElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter am Prototyp von ${input.tagName}`);
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function click(selector: string): Promise<void> {
  const el = query(selector);
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export async function clickElement(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/**
 * Direkt am Formular ausgeloest, nicht ueber den Knopf: ein deaktivierter Knopf
 * verschluckte das Ereignis, und genau dann muss der Absende-Guard im Code
 * greifen — der ist hier der Pruefgegenstand.
 */
export async function submitForm(selector = "form"): Promise<void> {
  const form = query<HTMLFormElement>(selector);
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/**
 * Abfragen fuer PORTAL-Inhalt.
 *
 * antd rendert `Drawer`, `Modal`, `Tooltip` und `Dropdown` durch ein Portal
 * nach `document.body` — der Inhalt ist ein GESCHWISTER des Mount-Wirts, kein
 * Nachfahre. `query()` oben sucht im Wirt und findet ihn deshalb nie. Das ist
 * keine Eigenheit eines einzelnen Tests, sondern wie antd arbeitet.
 *
 * Bewusst eigene Funktionen statt `query()` aufzubohren: wer `queryPortal`
 * schreibt, sagt damit "ich pruefe etwas, das ausserhalb meines Baums haengt".
 * Ein `query()`, das erst im Wirt und dann im Dokument sucht, faende auch
 * Ueberbleibsel eines vorherigen Tests, ohne dass es auffiele.
 */
export function queryPortal<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.body.querySelector<T>(selector);
  if (!el) throw new Error(`Element nicht im Dokument gefunden: ${selector}`);
  return el;
}

export function existsPortal(selector: string): boolean {
  return document.body.querySelector(selector) !== null;
}

export async function clickPortal(selector: string): Promise<void> {
  await clickElement(queryPortal(selector));
}
