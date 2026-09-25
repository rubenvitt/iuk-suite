/**
 * Knopf im Maß der Vorlage (`Button` in `_ds_bundle.js`, `components/verwaltung/forms/Button.jsx`):
 * 44 px hoch, Radius 8, Suite-Rot nur für die Primäraktion. Die Farben stehen in `app.css`
 * (`.knopf-*`), Hover und Druck über CSS statt über JavaScript-Zustand.
 */
import type { ComponentPropsWithRef } from "react";

import { Zeichen, type ZeichenName } from "./Symbol";

export type KnopfVariante = "standard" | "primaer" | "gefahr" | "text";

interface KnopfProps extends Omit<ComponentPropsWithRef<"button">, "type"> {
  variante?: KnopfVariante;
  zeichen?: ZeichenName;
}

export function Knopf({ variante = "standard", zeichen, className, children, ...rest }: KnopfProps) {
  const nurZeichen = zeichen !== undefined && (children === undefined || children === null);
  const klassen = ["knopf", `knopf-${variante}`, nurZeichen ? "knopf-quadrat" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={klassen} {...rest}>
      {zeichen ? <Zeichen name={zeichen} /> : null}
      {children}
    </button>
  );
}
