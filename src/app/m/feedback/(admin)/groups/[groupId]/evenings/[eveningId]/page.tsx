import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "../../../../../_db/client";
import { getGroup, getEvening, getSurveyByEvening, memberGroupIdsFor } from "../../../../../_db/queries";
import { viewerFromSession } from "../../../../../_lib/viewer";
import { assertGroupAccess } from "../../../../../_lib/access";
import { nextStatusOnAccess, type SurveyStatus } from "../../../../../_lib/lifecycle";
import { SPACE } from "@/core/theme/tokens";
import { SurveyControls } from "../../../../SurveyControls";

// Server-Komponente: kein antd-Compound-Zugriff. Der Guard prüft die ECHTE
// group_id des Dienstabends (nicht den `groupId`-URL-Parameter) — sonst
// könnte jemand mit Zugriff auf Gruppe A über
// `/groups/<A>/evenings/<evening-von-B>` eine fremde Umfrage sehen, weil der
// Check nur gegen den (frei wählbaren) URL-Teil liefe, während die
// tatsächlich geladenen Daten zu einer anderen Gruppe gehören (IDOR). Der
// URL-`groupId` wird NUR zur Hygiene abgeglichen (falsche Kombination →
// 404), nicht für den Zugriffsentscheid selbst verwendet.
export default async function EveningDetail({
  params,
}: {
  params: Promise<{ groupId: string; eveningId: string }>;
}) {
  const { groupId, eveningId } = await params;
  const urlGroupId = Number(groupId);
  const id = Number(eveningId);
  const viewer = viewerFromSession(await auth());
  const db = getDb();

  const evening = getEvening(db, id);
  if (!evening) notFound();
  if (evening.groupId !== urlGroupId) notFound(); // URL-Hygiene, nicht der Guard selbst.

  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  try {
    assertGroupAccess(viewer, evening.groupId, memberIds);
  } catch {
    notFound(); // 404 statt 403 — verrät die Existenz nicht.
  }
  const group = getGroup(db, evening.groupId);
  if (!group) notFound();

  const survey = getSurveyByEvening(db, id);
  // Anzeige-Status = derselbe Wert, der auch die Button-Auswahl in
  // SurveyControls treibt (kein Auseinanderlaufen von Badge und Buttons).
  // BEWUSST kein Schreiben hier (anders als ParticipatePage aus Task 11):
  // ein Server-Component-GET kann durch Next.js-Link-Prefetch (Hover) ohne
  // echten Seitenaufruf feuern — ein DB-Write dort würde eine Umfrage
  // schließen, die niemand tatsächlich geöffnet hat. Der tatsächliche
  // Auto-Close bleibt an der einzigen Stelle, die einen echten Zugriff
  // bestätigt: `f/[slugSecret]/page.tsx`.
  const effectiveStatus: SurveyStatus | null = survey
    ? nextStatusOnAccess(survey.status as SurveyStatus, survey.closesAt, new Date())
    : null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{evening.topic ?? "(ohne Thema)"}</h1>
        <p style={{ margin: 0 }}>
          {group.name} — {new Date(evening.date).toISOString().slice(0, 10)}
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Umfrage</h2>
        <SurveyControls
          eveningId={id}
          survey={survey ? { id: survey.id, status: effectiveStatus! } : null}
        />
        {(effectiveStatus === "closed" || effectiveStatus === "archived") && (
          <p style={{ margin: 0 }}>
            {/* Ziel entsteht erst in Task 13 (Auswertungs-UI) — Vorgriff laut
                Brief ("Link zur Auswertung (Task 13)"); bis dahin 404. */}
            <Link href={`/m/feedback/groups/${evening.groupId}/evenings/${id}/auswertung`}>
              Auswertung ansehen
            </Link>
          </p>
        )}
      </section>
    </section>
  );
}
