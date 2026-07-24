import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "../../../_db/client";
import { getGroup, listEvenings, memberGroupIdsFor } from "../../../_db/queries";
import { viewerFromSession } from "../../../_lib/viewer";
import { assertGroupAccess } from "../../../_lib/access";
import { SPACE } from "@/core/theme/tokens";
import { EveningForm } from "../../EveningForm";

// Server-Komponente: kein antd-Compound-Zugriff (X.Y) — schlichtes HTML, kein
// `Typography`/`List`. `id` ist hier zugleich Prüf- und Ladeschlüssel (kein
// Auseinanderlaufen zwischen Guard und Daten wie bei der Dienstabend-Seite).
export default async function GroupDetail({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub) : [];
  try {
    assertGroupAccess(viewer, id, memberIds);
  } catch {
    notFound(); // 404 statt 403 — verrät die Existenz nicht.
  }
  const group = getGroup(db, id);
  if (!group) notFound();
  const evenings = listEvenings(db, id);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{group.name}</h1>
        <p style={{ margin: 0 }}>
          QR-Token-Basis: <code>{group.slug}-{group.secret}</code>
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Dienstabende</h2>
        <ul style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, listStyle: "none", margin: 0, padding: 0 }}>
          {evenings.map((e) => (
            <li key={e.id}>
              <Link href={`/m/feedback/groups/${id}/evenings/${e.id}`}>
                {new Date(e.date).toISOString().slice(0, 10)} — {e.topic ?? "(ohne Thema)"}
              </Link>
            </li>
          ))}
        </ul>
        {evenings.length === 0 && <p style={{ opacity: 0.65, margin: 0 }}>Noch keine Dienstabende.</p>}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Neuer Dienstabend</h2>
        <EveningForm groupId={id} />
      </section>
    </section>
  );
}
