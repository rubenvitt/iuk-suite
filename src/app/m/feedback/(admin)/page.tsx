import { auth } from "@/core/auth";
import { getDb } from "../_db/client";
import { listGroups, memberGroupIdsFor } from "../_db/queries";
import { viewerFromSession } from "../_lib/viewer";
import { accessibleGroupFilter, isFeedbackAdmin } from "../_lib/access";
import { SPACE } from "@/core/theme/tokens";
import { GroupForm } from "./GroupForm";
import { GroupList } from "./GroupList";

// Server-Komponente: Überschrift als schlichtes HTML, kein `Typography.Title`
// — ein Compound-Zugriff auf einen antd-Import ergäbe hier einen 500er (siehe
// Global Constraints). Die Gruppenliste (antd `List`) ist deshalb in die
// Client-Komponente `GroupList` ausgelagert.
export default async function FeedbackDashboard() {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  const filter = accessibleGroupFilter(viewer, memberIds);
  const all = listGroups(db);
  const groups = filter === "all" ? all : all.filter((g) => filter.includes(g.id));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Feedback — Gruppen</h1>
      <GroupList groups={groups.map((g) => ({ id: g.id, name: g.name, slug: g.slug }))} />
      {isFeedbackAdmin(viewer) ? (
        <section style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Neue Gruppe anlegen</h2>
          <GroupForm />
        </section>
      ) : null}
    </section>
  );
}
