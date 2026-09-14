"use client";

import { AutoComplete } from "antd";
import { kategorieSchluessel } from "../_lib/kategorie";

type KategorieEingabeProps = {
  /** Die schon vergebenen Kategorien, je eine Schreibweise (`kategorieOptionen`). */
  kategorien: readonly string[];
  id?: string;
  value?: string;
  onChange?: (wert: string) => void;
  onBlur?: () => void;
  "aria-label"?: string;
};

/**
 * DRK-294 — Freitext mit Vorschlaegen. `AutoComplete` statt `Select`: eine neue
 * Kategorie entsteht durch Eintippen, nicht durch eine Verwaltungsseite.
 *
 * Die Vorschlaege filtern ueber `kategorieSchluessel`, also dieselbe Faltung wie
 * der Kategorienfilter: wer „hyg" tippt, bekommt „Hygiene" angeboten und landet
 * nicht versehentlich bei einer zweiten Schreibweise.
 *
 * `value`/`onChange` in der Form, die `Form.Item` einspritzt — dieselbe
 * Komponente traegt den Dialog „Neuer Artikel" und die Stammdaten der Schublade.
 * Kein `size` (CLAUDE.md, Falle 4).
 */
export function KategorieEingabe({
  kategorien, id, value, onChange, onBlur, "aria-label": ariaLabel,
}: KategorieEingabeProps) {
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      options={kategorien.map((kategorie) => ({ value: kategorie }))}
      showSearch={{
        filterOption: (eingabe, option) => (
          kategorieSchluessel(String(option?.value ?? "")).includes(kategorieSchluessel(eingabe))
        ),
      }}
      aria-label={ariaLabel}
      style={{ width: "100%" }}
    />
  );
}
