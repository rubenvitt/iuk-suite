import Link from "next/link";
import { Button } from "antd";
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetForm } from "@/app/m/qr/admin/preset-form";
import { deletePresetAction } from "@/app/m/qr/actions";
import { RAHMEN } from "@/app/m/qr/_lib/style";
import { TAP } from "@/core/theme/tokens";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }} data-testid="qr-admin">
      {/* Server-Komponente: Überschriften als schlichtes HTML, kein
          `Typography.Title` — `X.Y` auf einem antd-Import ergäbe hier einen 500er
          (Global Constraints). Aus demselben Grund bleibt die Liste ein
          <ul>/<li> statt `List`/`List.Item`. */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Presets verwalten</h1>
        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
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
                gap: 12,
                border: RAHMEN,
                borderRadius: 8,
                padding: 8,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden="true">{p.icon}</span>
                {p.label} <code style={{ opacity: 0.65 }}>{p.id}</code>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Ein Link, kein Formular: das Bearbeiten aendert nichts, es
                    waehlt nur aus, welches Preset das Formular unten zeigt. */}
                <Link
                  href={`/admin?bearbeiten=${encodeURIComponent(p.id)}`}
                  data-testid="preset-edit"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: TAP,
                    paddingInline: 12,
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
        {presets.length === 0 && <p style={{ opacity: 0.65 }}>Noch keine Presets angelegt.</p>}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
