import { Card, Col, Row } from "antd";
import { auth } from "@/core/auth";
import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";

import { SPACE } from "@/core/theme/tokens";
export default async function PortalPage() {
  const session = await auth();
  const services = await getVisibleServicesForUser(session?.user?.groups ?? []);
  return (
    <Row gutter={[SPACE.lg, SPACE.lg]} data-testid="portal-grid">
      {services.map((s) => (
        <Col key={s.id} xs={12} sm={8}>
          {/* Der Link liegt AUSSEN: antds Card rendert kein <a>, und die Kachel
              ist die einzige Navigation ins Ziel — sie muss ein Link bleiben. */}
          <a
            href={s.url}
            target={s.openInNewTab ? "_blank" : undefined}
            rel={s.openInNewTab ? "noopener noreferrer" : undefined}
            data-testid="service-tile"
            style={{ display: "block", height: "100%" }}
          >
            {/* Kein `Card.Meta`: diese Datei ist eine Server-Komponente, und
                Property-Zugriffe auf antd-Compounds ergeben dort `undefined`
                (siehe Global Constraints). Schlichtes Markup tut hier dasselbe. */}
            <Card hoverable size="small" style={{ height: "100%" }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.description ? (
                <div style={{ fontSize: 14, opacity: 0.65 }}>{s.description}</div>
              ) : null}
            </Card>
          </a>
        </Col>
      ))}
    </Row>
  );
}
