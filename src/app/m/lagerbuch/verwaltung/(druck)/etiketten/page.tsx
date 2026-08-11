import { headers } from "next/headers";
import { requireLagerbuchHost } from "../../../_lib/host";
import { requireLagerbuchAdmin } from "../../../_lib/zugang";
import { getDb } from "../../../_db/client";
import { etikettenDaten, EtikettenBasisFehlt } from "../../../_db/etiketten";
import { etikettenDomainFehlt } from "../../../_lib/zustandTexte";
import { EtikettenBogen } from "./EtikettenBogen";

export const dynamic = "force-dynamic";

/**
 * DER ETIKETTENBOGEN → /verwaltung/etiketten (Entscheidung 8-H2).
 *
 * DER OEFFENTLICHE PFAD BLEIBT. Route-Gruppen erscheinen nicht in der URL; ein
 * naiv unter der Modulwurzel angelegtes (druck)/etiketten loeste auf
 * /etiketten auf. Der Pfad steht in Lesezeichen und in der Navigation — ihn
 * nebenbei zu verschieben waere genau die Sorte stiller Aenderung, die §8
 * sonst verhindert.
 *
 * ZWEITE LINIE DER RIEGEL. Das (druck)-Layout riegelt bereits; diese Seite tut
 * es noch einmal. Beides ist Pflicht, weil `requiresAuth: false` gilt und die
 * Middleware hier nicht gatet (§8.4, 8-H, „Zwei Linien sind Pflicht").
 *
 * KEIN antd UND KEIN ICON IN DIESER DATEI. Sie ist eine Server Component: ein
 * Compound-Zugriff (Typography.Title & Geschwister) ergaebe HTTP 500 (Falle 1),
 * ein @ant-design/icons-Import ebenfalls — und zwar SCHON BEIM IMPORT, nicht
 * beim Rendern, waehrend typecheck und build gruen bleiben (Falle 7). Der
 * einfachste Weg, beide Fallen strukturell auszuschliessen, ist: gar kein antd
 * hier. Was antd braucht, steht in der Insel daneben.
 */
export default async function EtikettenSeite() {
  requireLagerbuchHost(await headers());
  await requireLagerbuchAdmin();

  let daten;
  try {
    daten = await etikettenDaten(getDb());
  } catch (e) {
    /**
     * §11.5, ZUSTAND 38 / Entscheidung 8-B. NUR diese eine Klasse wird gefangen;
     * jeder andere Wurf faellt an error.tsx durch, und das ist richtig — ein
     * Datenbankfehler ist kein Konfigurationsfehler, und ein Textvergleich als
     * Kontrollfluss braeche beim ersten Umformulieren.
     *
     * §11.7: der Zustand traegt einen benannten Weg zurueck.
     */
    if (e instanceof EtikettenBasisFehlt) {
      return (
        <div className="lb-nichtDrucken">
          <h1>Etiketten</h1>
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
      <h1 className="lb-nichtDrucken">Etiketten</h1>
      {/*
        §8.1, 8-B, Fehlerzustand 2: `moduleUrl` nimmt prodHostsFor(mod)[0]. Eine
        Umsortierung von SUITE_HOST_LAGERBUCH aendert STILL jeden ab dann
        gedruckten Bogen, waehrend die alten Etiketten weiter auf den frueheren
        ersten Eintrag zeigen. Diese Zeile kostet nichts und ist der einzige Weg,
        den Fehler VOR dem Papier zu bemerken.
      */}
      <p className="lb-nichtDrucken" data-testid="lb-basis">
        Alle QR-Codes zeigen auf {daten.basis}
      </p>
      <EtikettenBogen artikel={daten.artikel} tokens={daten.tokens} />
      {/*
        BETREIBERENTSCHEIDUNG, 10.08.2026 (Review-Nachtrag zu T162): der
        Global Constraint „Jeder gestaltete Zustand traegt einen benannten Weg
        zurueck" gewinnt gegen §8.4s „Was NICHT geaendert wird" — die Alt-
        Anwendung zeigte den leeren Bestand in einer Seite MIT Navigation,
        `DruckRahmen` hat konstruktionsbedingt KEINE. Ohne diesen Link waere
        der leere Bogen eine Sackgasse; das ist keine Abweichung von der
        1:1-Pflicht, sondern deren Folge.

        Die Bedingung dupliziert EtikettenBogens eigene `keys.length === 0`
        (dort Wortlaut-1:1-Pflicht, nicht anzufassen) bewusst hier: `page.tsx`
        haelt dieselben Daten (`daten.artikel`, `daten.tokens`) bereits vor,
        und der Link steht damit als ECHTES DOM-Geschwister direkt NACH dem
        `<p>`, das <EtikettenBogen> im leeren Fall rendert.
      */}
      {daten.artikel.length === 0 && daten.tokens.length === 0 && (
        <p className="lb-nichtDrucken">
          <a href="/verwaltung">Zurück zur Übersicht</a>
        </p>
      )}
    </>
  );
}
