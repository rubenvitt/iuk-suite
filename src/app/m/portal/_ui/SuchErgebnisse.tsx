import { Card, Tag } from "antd";

import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import type { ModulErgebnis } from "@/app/m/portal/_lib/suche";

/**
 * Die Treffer der suiteweiten Suche, je Modul ein Abschnitt (IDA-301). Zwei Leser: die Suchseite
 * (Server Component) und das Suchfeld der Startseite (`DiensteRaster`, Client-Insel). Deshalb OHNE
 * Direktive und nur mit Bausteinen, die auf beiden Seiten gehen (`Card`, `Tag`, `Icons8Ikone`; Falle 1).
 */
export function SuchErgebnisse({ ergebnisse }: { ergebnisse: ModulErgebnis[] }) {
  return (
    <>
      {ergebnisse.map((e) => (
        <ModulAbschnitt key={e.modul} ergebnis={e} />
      ))}
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
