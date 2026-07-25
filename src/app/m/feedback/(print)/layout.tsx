// Die eigenen Variablen des Moduls (`--fb-*`) UND die Druckregeln. Beide
// Importe sind Pflicht und beide scheitern still, wenn sie fehlen: antd
// deklariert `--ant-*` nur auf der Scope-Klasse seiner eigenen Komponenten
// (§4.10), und ein Aushang besteht fast vollständig aus eigenem Markup — ohne
// `feedback.css` verliert der Gruppenname einfach seine Farbe, ohne dass
// `pnpm build` etwas meldet.
import "../_ui/feedback.css";
import "./druck.css";
import { requireFeedbackAccess } from "../_lib/requireFeedbackAccess";

/**
 * DAS DRUCK-LAYOUT DES AUSHANGS (Entwurf §3.5).
 *
 * EIGENE ROUTE-GROUP OHNE SUITE-CHROME: würde der Aushang unter `(admin)`
 * liegen, druckte `FullShell` Header und AppSwitcher mit — und ein
 * Papieraushang mit Navigationsleiste ist kein Aushang. Das Pfadsegment ist
 * bewusst `aushang/[groupId]` und nicht `groups/[groupId]/aushang`: zwei
 * Route-Groups dürfen denselben aufgelösten Pfad nicht doppelt belegen.
 *
 * DER PREIS UND SEINE BEZAHLUNG: mit dem `(admin)`-Layout fällt auch dessen
 * Auth-Riegel weg — und diese Seite zeigt das SECRET der Gruppe, also den
 * dauerhaften Zugang zu jeder künftigen Umfrage. Deshalb ruft dieses Layout
 * denselben `requireFeedbackAccess` wie die Verwaltung (EINE Stelle, keine
 * zweite Prüfung), und die Seite prüft zusätzlich `guardPage(groupId)` gegen die
 * geladene Gruppen-Id. Zwei Linien, weil `feedback` `requiresAuth: false` ist
 * und die Middleware hier nicht gatet.
 */
export default async function FeedbackPrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeedbackAccess();

  return <>{children}</>;
}
