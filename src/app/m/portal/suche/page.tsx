import { Card, Result, Tag } from "antd";

import { auth } from "@/core/auth";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { MINDESTLAENGE, suchbegriff } from "@/core/suche";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { sucheUeberall, type ModulErgebnis } from "@/app/m/portal/_lib/suche";
import { SuchFeld } from "@/app/m/portal/_ui/SuchFeld";

export const dynamic = "force-dynamic";

/**
 * DIE SUITEWEITE SUCHE (IDA-301). Server Component: Sitzung lesen, jedes Modul fragen
 * (`_lib/suche.ts`), fertige Treffer zeigen. Die Rechteprüfung steckt in den Modulen; diese Seite
 * zeigt nur, was sie zurückgeben.
 *
 * Der Begriff steht in der Adresse (`?q=`), damit Zurück und Neu laden funktionieren. Gesucht wird nur
 * in Sachdaten (Geräte, Fahrzeuge, Material), nicht in Personaldaten — deshalb ist eine Spur im
 * Browserverlauf hier vertretbar.
 *
 * Nur antd-Bausteine, die in einer Server Component sicher sind (`Card`, `Result`, `Tag`; Falle 1).
 */
export default async function SuchSeite({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const roh = (await searchParams).q;
  const eingabe = (Array.isArray(roh) ? roh[0] : roh)?.trim() ?? "";
  const begriff = suchbegriff(roh);
  const ergebnisse = begriff ? sucheUeberall(begriff, await auth()) : [];

  return (
    <>
      <Seitenkopf
        titel="Suche"
        beschreibung="Findet Funkgeräte, Fahrzeuge und Material in allen Modulen, die du öffnen darfst."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
        <SuchFeld begriff={eingabe} />
        {eingabe !== "" && !begriff ? (
          <p data-testid="suche-zu-kurz" style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", margin: 0 }}>
            Gib mindestens {MINDESTLAENGE} Zeichen ein.
          </p>
        ) : null}
        {begriff && ergebnisse.length === 0 ? (
          <Result
            data-testid="suche-ohne-treffer"
            status="info"
            title={`Nichts gefunden für „${begriff}“`}
            subTitle="Gesucht wurde nur in den Modulen, die du öffnen darfst."
          />
        ) : null}
        {ergebnisse.map((e) => (
          <ModulAbschnitt key={e.modul} ergebnis={e} />
        ))}
      </div>
    </>
  );
}

function ModulAbschnitt({ ergebnis }: { ergebnis: ModulErgebnis }) {
  return (
    <section data-testid="suche-modul" data-modul={ergebnis.modul}>
      <h2
        style={{
          ...SCHRIFT.kicker,
          color: "var(--iuk-gedaempft)",
          marginBlock: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: SPACE.xs,
        }}
      >
        <Icons8Ikone name={ergebnis.icon} />
        {ergebnis.titel}
      </h2>
      {ergebnis.zustand === "fehler" ? (
        <p data-testid="suche-modul-fehler" style={{ ...SCHRIFT.neben, margin: 0 }}>
          Dieses Modul konnte gerade nicht durchsucht werden. Versuch es gleich noch einmal.
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: SPACE.md,
            }}
          >
            {ergebnis.treffer.map((t) => (
              <a key={t.id} href={t.href} data-testid="suche-treffer" style={{ display: "block", color: "inherit" }}>
                <Card hoverable size="small" style={{ blockSize: "100%" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.sm }}>
                    <span style={{ ...SCHRIFT.unterTitel, minInlineSize: 0, overflowWrap: "anywhere" }}>{t.titel}</span>
                    <Tag style={{ marginInlineEnd: 0 }}>{t.art}</Tag>
                  </div>
                  {t.merkmale.length > 0 ? (
                    <dl style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0`, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: SPACE.sm }}>
                      {t.merkmale.map((m) => (
                        <div key={m.etikett} style={{ display: "contents" }}>
                          <dt style={{ color: "var(--iuk-gedaempft)" }}>{m.etikett}</dt>
                          <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{m.wert}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </Card>
              </a>
            ))}
          </div>
          {ergebnis.mehr ? (
            <p data-testid="suche-mehr" style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", margin: `${SPACE.sm}px 0 0` }}>
              Es gibt weitere Treffer. Such genauer, um sie zu sehen.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
