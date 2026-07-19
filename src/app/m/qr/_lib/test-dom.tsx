import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

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
 */
export async function fill(selector: string, value: string): Promise<void> {
  const input = query<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Kein value-Setter am HTMLInputElement-Prototyp");
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
