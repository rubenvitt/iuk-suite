import { notFound } from "next/navigation";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { AuditAccessDenied } from "@/core/audit/access";
import { readAuditView } from "./read";
import type { AuditSearch } from "./filters";
import { AuditLog } from "./AuditLog";
export const metadata = { title: "Audit-Log" };
export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditSearch> }) {
  const search = await searchParams;
  const view = await readAuditView(search).catch(error => {
    if (error instanceof AuditAccessDenied) notFound();
    throw error;
  });
  return <div data-testid="audit-log">
    <Seitenkopf titel="Audit-Log" beschreibung="Wer hat wann was geändert oder abgerufen? Hier siehst du Ereignisse aus der gesamten Suite. Nur Suite-Admins haben Zugriff." zurueck={{ titel: "Verwaltung", href: "/admin" }} />
    <AuditLog key={JSON.stringify(search)} view={view} search={search} />
  </div>;
}
