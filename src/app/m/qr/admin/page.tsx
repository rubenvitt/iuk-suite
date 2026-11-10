import Link from "next/link";
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetForm } from "@/app/m/qr/admin/preset-form";
import { LoeschKnopf } from "@/app/m/qr/admin/LoeschKnopf";
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
      <Seitenkopf titel="Schnellzugriffe verwalten" />
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
              // Die id ist Technik (aus der Bezeichnung abgeleitet) und steht nicht mehr als Text
              // in der Zeile (IDA-390); e2e liest sie hier ab.
              data-preset-id={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.md,
                border: RAHMEN,
                borderRadius: 8,
                padding: SPACE.sm,
                /*
                 * `flexWrap`: rechts steht „Bearbeiten" (96px), links die
                 * Bezeichnung; ein Flex-Kind hat per Vorgabe `min-width: auto`
                 * und kann weder schrumpfen noch umbrechen. Mit einem langen
                 * Namen sprang die Zeile sonst über die Seitenbreite.
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
                  overflowWrap: "anywhere",
                }}
              >
                <span aria-hidden="true">{p.icon}</span>
                {p.label}
              </span>
              {/* Ein Link, kein Formular: das Bearbeiten aendert nichts, es
                  waehlt nur aus, welcher Eintrag das Formular unten zeigt.
                  „Löschen" steht nicht mehr hier, sondern abgesetzt unter dem
                  Bearbeiten-Formular (`LoeschKnopf`). */}
              <Link
                href={`/admin?bearbeiten=${encodeURIComponent(p.id)}`}
                data-testid="preset-edit"
                aria-label={`${p.label} bearbeiten`}
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
            </li>
          ))}
        </ul>
        {presets.length === 0 && (
          <p style={{ color: "var(--iuk-gedaempft)" }}>
            Noch keine Schnellzugriffe angelegt.
          </p>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {editing ? `„${editing.label}“ bearbeiten` : "Neuen Schnellzugriff anlegen"}
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
        {/* Abgesetzt vom Formular und von „Abbrechen": zerstörende Knöpfe stehen nicht neben
            harmlosen (IDA-390). Die Rückfrage nennt den Namen. */}
        {editing && (
          <div style={{ borderTop: RAHMEN, paddingTop: SPACE.lg, marginTop: SPACE.lg }}>
            <LoeschKnopf id={editing.id} label={editing.label} kind={editing.kind} />
          </div>
        )}
      </section>
    </div>
  );
}

export const metadata = { title: "Schnellzugriffe verwalten" };
