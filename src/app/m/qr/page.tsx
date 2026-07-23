import Link from "next/link";
import { Button, Col, Row } from "antd";
import { auth } from "@/core/auth";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetGrid } from "@/app/m/qr/PresetGrid";
import { UrlInput } from "@/app/m/qr/UrlInput";
import { HistoryList } from "@/app/m/qr/HistoryList";

const KINDS = [
  { href: "/wifi", label: "WLAN", icon: "📶" },
  { href: "/tel", label: "Telefon", icon: "📞" },
  { href: "/contact", label: "Kontakt", icon: "👤" },
];

export default async function QrHomePage() {
  const session = await auth();
  // Anonym: keine Presets. Das Modul ist requiresAuth: false, session ist dann
  // schlicht null — kein Fehler, nur weniger Inhalt.
  const presets = session?.user ? await listPresets() : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} data-testid="qr-home">
      <UrlInput />

      {/* Überschrift und Hinweis als schlichtes HTML: Server-Komponente, also
          kein `Typography.Title`/`Typography.Paragraph` (Global Constraints). */}
      <section
        aria-label="Weitere Typen"
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Andere Typen</h2>
        <Row gutter={[12, 12]}>
          {KINDS.map((k) => (
            <Col key={k.href} span={8}>
              <Button
                block
                href={k.href}
                style={{ height: 72, display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>
                  {k.icon}
                </span>
                <span>{k.label}</span>
              </Button>
            </Col>
          ))}
        </Row>
      </section>

      {session?.user ? (
        <PresetGrid presets={presets} />
      ) : (
        <p data-testid="qr-login-hint" style={{ opacity: 0.65 }}>
          {/* Die MinimalShell hat keinen Login-Einstieg im Header, und ein
              anonymes Modul leitet nirgends automatisch hin — ohne diesen Link
              wüsste der Nutzer vom Anmelden, käme aber nicht hin. */}
          <Link href={`/login?callbackUrl=${encodeURIComponent("/")}`}>Anmelden</Link>, um
          persönliche Schnellzugriffe zu sehen.
        </p>
      )}

      <HistoryList />
    </div>
  );
}
