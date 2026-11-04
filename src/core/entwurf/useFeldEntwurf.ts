"use client";

import { useEffect, useState, type RefObject } from "react";
import { useEntwurf, type Entwurf } from "./useEntwurf";

/**
 * `useEntwurf` für ein UNGESTEUERTES `<form>` (`defaultValue`, `useActionState`,
 * Weiterleitung bei Erfolg) — IDA-358.
 *
 *   const form = useRef<HTMLFormElement>(null);
 *   const entwurf = useFeldEntwurf(form, `modul:zweck:${id}`);
 *   <form ref={form} action={…}>
 *   bei Erfolg (oder vor der Weiterleitung): entwurf.verwerfen()
 *
 * Gesichert wird je benanntem Feld der Wert, wie ihn das Formular abschicken
 * würde (Checkbox/Radio: angehakt oder nicht). Nicht gesichert werden Dateien,
 * Passwörter, versteckte Felder (die trägt der Server) und `data-kein-entwurf`.
 *
 * ⚠️ WIEDERHERGESTELLT WIRD AM DOM, nicht über React: ein ungesteuertes Feld hat
 * keinen Zustand, den React kennt. Für ein antd-Feld ohne natives `<input name>`
 * taugt das nicht — dort `useFormEntwurf`.
 */
type Werte = Record<string, string | boolean | string[]>;

function gesichert(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
  if (!el.name || el.disabled || el.hasAttribute("data-kein-entwurf")) return false;
  if (el instanceof HTMLInputElement && ["file", "password", "hidden", "submit", "button"].includes(el.type)) return false;
  return true;
}

function lies(form: HTMLFormElement): Werte {
  const w: Werte = {};
  for (const el of Array.from(form.elements)) {
    if (!gesichert(el)) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") w[`${el.name}::${el.value}`] = el.checked;
    else if (el instanceof HTMLInputElement && el.type === "radio") { if (el.checked) w[el.name] = el.value; }
    else if (el instanceof HTMLSelectElement && el.multiple) w[el.name] = Array.from(el.selectedOptions).map((o) => o.value);
    else w[el.name] = el.value;
  }
  return w;
}

function schreibe(form: HTMLFormElement, w: Werte) {
  for (const el of Array.from(form.elements)) {
    if (!gesichert(el)) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      const k = `${el.name}::${el.value}`;
      if (k in w) el.checked = w[k] === true;
    } else if (el instanceof HTMLInputElement && el.type === "radio") {
      if (el.name in w) el.checked = w[el.name] === el.value;
    } else if (el instanceof HTMLSelectElement && el.multiple) {
      const v = w[el.name];
      if (Array.isArray(v)) for (const o of Array.from(el.options)) o.selected = v.includes(o.value);
    } else if (el.name in w && typeof w[el.name] === "string") {
      el.value = w[el.name] as string;
    }
  }
}

export function useFeldEntwurf(form: RefObject<HTMLFormElement | null>, schluessel: string | null): Entwurf<never> {
  const [werte, setWerte] = useState<Werte | null>(null);
  const entwurf = useEntwurf<Werte | null, never>({
    schluessel,
    stand: werte,
    wiederherstellen: (w) => {
      const f = form.current;
      if (f) {
        if (w) schreibe(f, w);
        else f.reset();
      }
      setWerte(w);
    },
  });
  useEffect(() => {
    const f = form.current;
    if (!f) return;
    const merke = () => setWerte(lies(f));
    f.addEventListener("input", merke);
    f.addEventListener("change", merke);
    return () => {
      f.removeEventListener("input", merke);
      f.removeEventListener("change", merke);
    };
  }, [form]);
  return entwurf;
}
