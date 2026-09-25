import { headers } from "next/headers";
import { requireLagerbuchHost } from "../../../_lib/host";
import { requireLagerbuchAdmin } from "../../../_lib/zugang";
import { getDb } from "../../../_db/client";
import { ortEtikettenDaten, EtikettenBasisFehlt } from "../../../_db/etiketten";
import { etikettenDomainFehlt } from "../../../_lib/zustandTexte";
import { OrtsetikettenBogen } from "./OrtsetikettenBogen";
import { OrtsetikettenChrome } from "./OrtsetikettenChrome";

export const dynamic = "force-dynamic";

/**
 * DIE ORTSKARTEN → /verwaltung/ortsetiketten (DRK-312, Bogenformat DRK-388).
 *
 * Eine Karte je Handlager bzw. Einheit, acht Karten je A4-Blatt. Der
 * Etikettenbogen nebenan (`/verwaltung/etiketten`) bleibt unveraendert: er
 * druckt weiter je Produkt auf gekauftes Klebematerial, und das Ticket sagt
 * ausdruecklich, dass die bestehenden Produktcodes ohne Migrationsentscheidung
 * nicht verschwinden.
 *
 * ⚠️ DIESE SEITE SCHREIBT — DRK-406, und das ist bei einem GET
 * bemerkenswert genug, um hier zu stehen. `ortEtikettenDaten` zieht jeden
 * fehlenden Ortscode nach, bevor es die Karten baut; die Zusage „jede Karte
 * traegt einen Code" haengt sonst an einem Knopf, den jemand druecken muss, und
 * ist auf Papier keine Zusage. Der Vorgang ist idempotent und rein additiv, und
 * die Insel sagt am Schirm, wie viele Codes dabei neu entstanden sind.
 *
 * ZWEI FLAECHEN UND NICHT EINE, und der Grund ist das Papier: die Karten
 * brauchen einen anderen Seitenrand als der Etikettenbogen (4mm statt 8mm),
 * damit acht davon auf ein Blatt gehen — und Chromium verwirft die
 * CSS-Seitenvorgabe VOLLSTAENDIG, sobald ein Dokument gemischte Seitengroessen
 * ergibt (gemessen). Ein dritter Abschnitt auf der bestehenden Seite haette den
 * Etikettenbogen still mit umformatiert.
 *
 * ZWEITE LINIE DER RIEGEL. Das (druck)-Layout riegelt bereits; diese Seite tut
 * es noch einmal. Beides ist Pflicht, weil `requiresAuth: false` gilt und die
 * Middleware hier nicht gatet (§8.4, 8-H, „Zwei Linien sind Pflicht").
 * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d).
 *
 * KEIN antd UND KEIN ICON IN DIESER DATEI. Sie ist eine Server Component: ein
 * Compound-Zugriff ergaebe HTTP 500 (Falle 1), ein
 * `@ant-design/icons`-Import ebenfalls — und zwar SCHON BEIM IMPORT (Falle 7).
 * Was antd braucht, steht in der Insel daneben; genauso macht es
 * `etiketten/page.tsx`.
 */
export default async function OrtsetikettenSeite() {
  requireLagerbuchHost(await headers());
  /*
   * ⚠️ DER VIEWER WIRD FESTGEHALTEN, NICHT WEGGEWORFEN — DRK-406. Diese Seite
   * zieht fehlende Ortscodes nach, und jede so entstandene Zeile traegt einen
   * `created_by`. Ein System-Akteur waere dort eine Luege: ohne DIESEN
   * Seitenaufruf waere keine Zeile entstanden.
   */
  const viewer = await requireLagerbuchAdmin();

  let daten;
  try {
    daten = await ortEtikettenDaten(getDb(), viewer.sub, viewer.name);
  } catch (e) {
    /*
     * NUR diese eine Klasse wird gefangen; jeder andere Wurf faellt an
     * error.tsx durch (§11.5, Zustand 38 / Entscheidung 8-B). Ein Textvergleich
     * als Kontrollfluss braeche beim ersten Umformulieren, still.
     */
    if (e instanceof EtikettenBasisFehlt) {
      return (
        <div className="lb-nichtDrucken">
          <h1>Ortsetiketten</h1>
          <p>{etikettenDomainFehlt()}</p>
          <p>
            <a href="/verwaltung">Zurück zur Übersicht</a>
          </p>
        </div>
      );
    }
    throw e;
  }

  return (
    <>
      <OrtsetikettenChrome basis={daten.basis} neueCodes={daten.neueCodes} alteCodes={daten.alteCodes} />
      <OrtsetikettenBogen orte={daten.orte} />
      {/*
        §11.7 — jeder gestaltete Zustand traegt einen benannten Weg zurueck, und
        `DruckRahmen` hat konstruktionsbedingt KEINE Navigation. Ohne diesen Link
        waere der leere Bogen eine Sackgasse. Dieselbe Bauform und dieselbe
        Begruendung wie in `etiketten/page.tsx`: die Bedingung steht bewusst
        auch hier, damit der Link ein echtes DOM-Geschwister des leeren Zustands
        ist, den die Insel rendert.
      */}
      {daten.orte.length === 0 && (
        <p className="lb-nichtDrucken">
          <a href="/verwaltung">Zurück zur Übersicht</a>
        </p>
      )}
    </>
  );
}
