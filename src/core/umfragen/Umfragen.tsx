"use client";

import Script from "next/script";
import { theme as antdTheme } from "antd";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { buildTheme } from "@/core/theme/theme";
import { umfragenFarbCss } from "@/core/umfragen/aussehen";
import type { UmfragenKonfiguration } from "@/core/umfragen/konfiguration";

/**
 * DIE UMFRAGEN-INSEL. Sie rendert nichts Sichtbares — das Widget baut
 * Formbricks selbst, sobald eine Umfrage für diese Fläche ausgespielt wird. Was
 * sie beiträgt, ist das Skript und die Bindung des Aussehens an den
 * Hell/Dunkel-Umschalter der Suite (`aussehen.ts`).
 *
 * ⚠️ DAS SKRIPT KOMMT VON DER FORMBRICKS-INSTANZ, NICHT AUS `node_modules`.
 * Formbricks bietet auch ein npm-Paket (`@formbricks/js`), und für eine
 * gehostete Instanz wäre das der bequemere Weg. Hier ist es der schlechtere:
 * die Instanz ist selbst gehostet, und ein npm-Paket trägt eine Version, die
 * bei jedem Update der Instanz auseinanderläuft (die Formbricks-Doku nennt für
 * das Paket ausdrücklich eine Version „to ensure compatibility"). Das Skript
 * von der Instanz passt dagegen IMMER zu dem Server, mit dem es spricht — ein
 * Auseinanderlaufen ist gar nicht erst möglich, und die Suite trägt keine
 * Abhängigkeit mehr, die jemand nachziehen müsste.
 *
 * ⚠️ KEIN `setTimeout(…, 500)`. Das Einbettungs-Snippet von Formbricks wartet
 * eine halbe Sekunde und ruft dann `setup()` — das ist eine Wette auf die
 * Ladezeit, keine Reihenfolge. Auf einer langsamen Leitung ist
 * `window.formbricks` nach 500 ms noch `undefined`, der Aufruf fällt aus, und
 * es passiert einfach nichts: kein Fehler, keine Umfrage. `onReady` von
 * `next/script` feuert, WENN das Skript da ist, und das ist die Zusicherung,
 * die man hier braucht.
 */

type FormbricksAufFenster = {
  setup: (optionen: { workspaceId: string; appUrl: string }) => void;
  registerRouteChange: () => void;
};

declare global {
  interface Window {
    formbricks?: FormbricksAufFenster;
  }
}

/**
 * MODULWEIT, NICHT JE INSTANZ. `onReady` feuert auch bei einem erneuten
 * Einhängen der Komponente, und `setup()` ein zweites Mal zu rufen wäre
 * mindestens eine Konsolenwarnung. Ein `useRef` löste das nicht: er lebt mit
 * der Instanz und wäre nach dem Wiedereinhängen zurückgesetzt. Diese Variable
 * lebt so lange wie das Dokument — also genau so lange wie das eingerichtete
 * `window.formbricks`, auf das sie sich bezieht.
 */
let eingerichtet = false;

/**
 * EINMAL JE PROZESS, NICHT JE RENDER — und das ist der Grund, warum die Rechnung
 * hier und nicht im Komponentenkörper steht: `getDesignToken` läuft antds
 * gesamten Algorithmus für beide Modi durch, das Ergebnis hängt aber an keiner
 * Prop und an keinem Zustand.
 *
 * ⚠️ DIE RECHNUNG GEHÖRT IN DIE CLIENT-INSEL, NICHT IN `FullShell` (Falle 7).
 * Sie braucht `theme` aus `antd`, und der nackte Spezifizierer löst in der
 * RSC-Ebene über `exports["."].node.import` auf CJS auf, das `createContext` auf
 * Modulebene ruft — HTTP 500 für jede Arbeitsfläche, schon beim Import.
 * `"use client"` ganz oben in dieser Datei ist also nicht nur für `window` und
 * die Hooks da. `einbindung.test.ts` hält fest, dass `FullShell` `aussehen` nicht
 * anfasst.
 */
const FARB_CSS = umfragenFarbCss(
  antdTheme.getDesignToken(buildTheme("light")),
  antdTheme.getDesignToken(buildTheme("dark")),
);

export function Umfragen({ appUrl, workspaceId }: UmfragenKonfiguration) {
  const pfad = usePathname();
  const suche = useSearchParams();

  const einrichten = useCallback(() => {
    if (eingerichtet) return;
    const formbricks = window.formbricks;
    if (!formbricks) return;
    formbricks.setup({ workspaceId, appUrl });
    eingerichtet = true;
  }, [appUrl, workspaceId]);

  /**
   * ⚠️ OHNE DIESE ZEILEN FEUERT EINE SEITENBEZOGENE UMFRAGE GENAU EINMAL —
   * beim harten Laden — UND DANN STILL NIE WIEDER.
   *
   * Der App Router wechselt innerhalb eines Moduls weich: die Hülle bleibt
   * stehen, nur der Inhalt tauscht. Für Formbricks sieht das aus wie gar keine
   * Navigation, denn es hört auf `popstate`/Erstladen und nicht auf Reacts
   * Router. `registerRouteChange()` ist der Anstoß, den die Formbricks-Doku
   * für Next.js dafür vorsieht.
   *
   * Der Lauf beim ersten Einhängen ist wirkungslos und soll es sein: da steht
   * `eingerichtet` noch auf `false`, weil das Skript erst danach lädt. Die
   * erste Fläche deckt `setup()` selbst ab.
   */
  useEffect(() => {
    if (!eingerichtet) return;
    window.formbricks?.registerRouteChange();
  }, [pfad, suche]);

  return (
    <>
      {/*
       * ⚠️ DAS STYLESHEET REIST MIT DER INSEL, NICHT MIT DEM WURZEL-LAYOUT.
       * Es könnte harmlos überall liegen — eine Regel auf `#fbjs` trifft ohne
       * Widget nichts. Es läge dann aber auf jeder Kiosk- und Druckseite, und
       * die Reichweite dieser Einbindung wäre nicht mehr an EINER Stelle
       * ablesbar (die Begründung dafür steht in `FullShell`). Mitreisen kostet
       * nichts: gerendert wird es nur, wo auch das Skript lädt.
       *
       * Kein `precedence`: React hob es damit in den `<head>` und in seine
       * Sortierung ein. Gebraucht wird das nicht — der Block gewinnt über die
       * Spezifität, nicht über die Reihenfolge (Begründung in `aussehen.ts`) —
       * und es wäre eine Abhängigkeit von Reacts Einsortierung, die niemand
       * braucht.
       */}
      <style id="umfragen-farben">{FARB_CSS}</style>
      <Script
        id="formbricks"
        src={`${appUrl}/js/formbricks.umd.cjs`}
        strategy="afterInteractive"
        onReady={einrichten}
      />
    </>
  );
}
