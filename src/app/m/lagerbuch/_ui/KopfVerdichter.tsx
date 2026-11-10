"use client";

import { useEffect, useRef } from "react";

/**
 * DER KOPF WIRD BEIM SCROLLEN SCHMAL — IDA-377.
 *
 * Kopf (drei Zeilen), Schrittleiste, schwebende Leiste und Reiterleiste ließen am Telefon etwa die
 * Hälfte des Schirms für Inhalt. Sobald der Inhalt gescrollt ist, setzt diese Insel `data-kompakt`
 * am Rahmen; das Stylesheet blendet dann Sitzungskennung und Restzeit aus (die Warnung bleibt) und
 * zieht den Kopf auf eine Zeile zusammen. Der Ausstieg behält seine 56px (Handschuhe, DRK-378).
 *
 * ⚠️ ZWEI SCHWELLEN STATT EINER: der schmalere Kopf macht den Scrollkasten höher, und an der Kante
 * kippte eine einzelne Schwelle hin und her.
 *
 * Gesucht wird der Rahmen über `data-rolle`, nicht über die Klasse: die Insel rendert nichts
 * Sichtbares und weiß nicht, wie das Stylesheet die Klassen benennt.
 */
const EIN = 40;
const AUS = 8;

export function KopfVerdichter() {
  const marke = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const rahmen = marke.current?.closest<HTMLElement>("[data-rolle='lb-rahmen']");
    const inhalt = rahmen?.querySelector<HTMLElement>("main");
    if (!rahmen || !inhalt) return;
    const pruefe = () => {
      const kompakt = rahmen.hasAttribute("data-kompakt");
      if (!kompakt && inhalt.scrollTop > EIN) rahmen.setAttribute("data-kompakt", "");
      else if (kompakt && inhalt.scrollTop < AUS) rahmen.removeAttribute("data-kompakt");
    };
    inhalt.addEventListener("scroll", pruefe, { passive: true });
    return () => inhalt.removeEventListener("scroll", pruefe);
  }, []);
  return <span ref={marke} hidden />;
}
