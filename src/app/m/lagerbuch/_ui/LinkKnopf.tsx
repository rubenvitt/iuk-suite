"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { useRouter } from "next/navigation";

/**
 * EIN KNOPF, DER INNERHALB DER VERWALTUNG NAVIGIERT (IDA-239).
 *
 * `Button href` allein rendert einen echten Anker und lädt damit das ganze
 * Dokument neu — richtig für Ziele außerhalb des Verwaltungsrahmens
 * (`fahrzeuge/CheckDurchfuehrenKnopf.tsx`), zu langsam für eine Seite im selben
 * Rahmen. Hier bleibt der Anker (Mittelklick, neuer Tab, Linkziel für
 * Hilfstechnik), und ein gewöhnlicher Klick navigiert clientseitig.
 *
 * ⚠️ NIE `<Link><Button/></Link>`: ein `<button>` in einem `<a>` ist verbotener
 * Inhalt, der Knopf schluckt den Klick (Begründung an `ChecklisteKnopf`).
 */
export function LinkKnopf({
  href,
  primaer = false,
  icon,
  children,
}: {
  href: string;
  primaer?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Button
      href={href}
      type={primaer ? "primary" : undefined}
      icon={icon}
      onClick={(ereignis) => {
        // Mit Zusatztaste oder anderer Maustaste entscheidet der Browser.
        if (ereignis.button !== 0 || ereignis.metaKey || ereignis.ctrlKey
          || ereignis.shiftKey || ereignis.altKey) return;
        ereignis.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </Button>
  );
}
