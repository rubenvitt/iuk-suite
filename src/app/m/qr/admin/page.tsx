import Link from "next/link";
import { Button } from "antd";
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetForm } from "@/app/m/qr/admin/preset-form";
import { deletePresetAction } from "@/app/m/qr/actions";
import { RAHMEN } from "@/app/m/qr/_lib/style";
import { SPACE, TAP } from "@/core/theme/tokens";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

/**
 * HANDSCHUH-DICHTE, NICHT ARBEITSDICHTE (Durchgang Aufgabe 13): `qr` läuft
 * unter `MinimalShell` (core/shell/MinimalShell.tsx) und behält dort das
 * Handschuh-Maß (`controlHeight: 56`, `controlHeightLG: 72`) — die
 * 44px-Arbeitsdichte aus Aufgabe 5 gilt auf dieser Seite NICHT. `TAP` unten
 * (56px am Bearbeiten-Link) und die `size="large"`-Vorkommen in
 * `preset-form.tsx` sind deshalb kein Handschuh-Rest, sondern weiterhin die
 * richtige Größe. Ein künftiger Durchgang, der nach 44px-Resten sucht, soll
 * hier nicht fündig werden — Punkt 2 der Prüfliste aus
 * `.superpowers/sdd/2026-08-13-navigation-und-dichte/task-13-brief.md` gilt
 * für diese Seite ausdrücklich nicht.
 */
export default async function QrAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ bearbeiten?: string }>;
}) {
  // 404 statt 403: ein 403 verriete, dass es diese Route gibt.
  await moduleAdminPageOrNotFound("qr");
  const presets = await listPresets();
  const { bearbeiten } = await searchParams;
  // Ueber die geladene Liste gesucht statt per eigener Abfrage: eine unbekannte
  // id ergibt so schlicht das Anlege-Formular, keinen Fehler.
  const editing = presets.find((p) => p.id === bearbeiten);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl }} data-testid="qr-admin">
      <Seitenkopf titel="Presets verwalten" />
      {/* Server-Komponente: Überschriften als schlichtes HTML, kein
          `Typography.Title` — `X.Y` auf einem antd-Import ergäbe hier einen 500er
          (Global Constraints). Aus demselben Grund bleibt die Liste ein
          <ul>/<li> statt `List`/`List.Item`. */}
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SPACE.sm,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {presets.map((p) => (
            <li
              key={p.id}
              data-testid="preset-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.md,
                border: RAHMEN,
                borderRadius: 8,
                padding: SPACE.sm,
                /*
                 * `flexWrap` ist der eigentliche Fix. Die Zeile hat rechts einen
                 * festen Block („Bearbeiten" 96px + „Loeschen" 86px = 182px);
                 * links steht Label plus Slug, und ein Flex-Kind hat per Vorgabe
                 * `min-width: auto` — es kann also weder schrumpfen noch
                 * umbrechen. Mit dem kurzen Seed-Preset faellt das nicht auf
                 * (356px Inhalt in 356px Kasten); mit einem realistischen Namen
                 * plus Slug sprang die Zeile auf 427px und das Dokument auf
                 * 444px, der „Loeschen"-Knopf stand auszerhalb.
                 */
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACE.sm,
                  /* Ohne `minWidth: 0` schrumpft der Block nicht unter seine
                     Inhaltsbreite — `flexWrap` allein reichte dann nicht. */
                  minWidth: 0,
                  flexWrap: "wrap",
                }}
              >
                <span aria-hidden="true">{p.icon}</span>
                {p.label}{" "}
                {/* Der Slug ist eine Nutzereingabe ohne Leerzeichen; ohne
                    `anywhere` ist er ein einziges, unteilbares Wort. */}
                {/* `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den
                    Kontrast unprüfbar mit und hat keinen Dunkelzweig
                    (globale Randbedingung, Durchgang Aufgabe 13). */}
                <code
                  style={{
                    color: "var(--iuk-gedaempft)",
                    overflowWrap: "anywhere",
                    minWidth: 0,
                  }}
                >
                  {p.id}
                </code>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
                {/* Ein Link, kein Formular: das Bearbeiten aendert nichts, es
                    waehlt nur aus, welches Preset das Formular unten zeigt. */}
                <Link
                  href={`/admin?bearbeiten=${encodeURIComponent(p.id)}`}
                  data-testid="preset-edit"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: TAP,
                    paddingInline: SPACE.md,
                    border: RAHMEN,
                    borderRadius: 8,
                  }}
                >
                  Bearbeiten
                </Link>
                <form action={deletePresetAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button danger htmlType="submit">
                    Löschen
                  </Button>
                </form>
              </span>
            </li>
          ))}
        </ul>
        {presets.length === 0 && (
          <p style={{ color: "var(--iuk-gedaempft)" }}>
            Noch keine Presets angelegt. Lege unten das erste an.
          </p>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {editing ? `Preset „${editing.label}“ bearbeiten` : "Neues Preset anlegen"}
        </h2>
        {/* `key`: wechselt der Admin von einem Preset direkt zum naechsten,
            bliebe der State des vorigen Formulars sonst stehen — React haelt
            dieselbe Instanz und die useState-Startwerte laufen nicht erneut. */}
        <PresetForm key={editing?.id ?? "neu"} preset={editing} />
        {editing && (
          <Link href="/admin" style={{ alignSelf: "flex-start" }}>
            Abbrechen
          </Link>
        )}
      </section>
    </div>
  );
}
