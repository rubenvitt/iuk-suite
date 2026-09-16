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
  await requireLagerbuchAdmin();

  let daten;
  try {
    daten = await ortEtikettenDaten(getDb());
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
      <OrtsetikettenChrome basis={daten.basis} />
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
