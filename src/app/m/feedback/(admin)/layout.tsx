import { redirect, notFound } from "next/navigation";
// Die eigenen CSS-Variablen des Moduls (`--fb-*`, `--note-*`). Sie liegen NICHT
// bei antd: antd deklariert `--ant-*` auf seiner Scope-Klasse, nicht auf
// `:root` — eigenes Markup sieht sie nie, und der Fehler ist still. Der Import
// steht im Layout, damit jede Seite unter `(admin)` sie hat, ohne ihn zu
// wiederholen.
import "../_ui/feedback.css";
import { auth } from "@/core/auth";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { viewerFromSession } from "../_lib/viewer";
import { isFeedbackAdmin } from "../_lib/access";
import { getDb } from "../_db/client";
import { upsertKnownUser } from "../_db/queries";

// full-Shell NUR für die Verwaltung: diese Route-Group liegt eine Ebene über
// `f/` (Task 11), das sein eigenes, chrome-loses Layout hat. Next.js-Layouts
// stapeln sich pro Pfad-Segment, nicht pro Route-Group — `f/` importiert
// dieses Layout hier also nie, weil `(admin)` und `f` Geschwister-Segmente
// unter `feedback/` sind (Route-Groups sind reine Ordnungs-Ordner, tragen
// aber trotzdem die Layout-Verschachtelung nur für ihren eigenen Ast).
//
// Auth-Backstop (Finding 3): `feedback` ist requiresAuth:false (Pflicht für die
// anonyme Teilnahme unter /f/) — dadurch gaten core/routing.ts + proxy.ts
// (die Middleware) die Verwaltung NICHT, und ohne diesen Guard wäre jede
// Seite unter (admin) allein auf sich gestellt. Zweite Linie hier, zusätzlich
// zu den Seiten-Guards (guardPage/assertGroupAccess), die unverändert bleiben:
// keine Session → Login-Redirect mit callbackUrl; Session ohne Zugang → 404
// (verrät nicht, dass es die Route gibt — konsistent mit den Seiten-Guards).
export default async function FeedbackAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mod = getModule("feedback");
  const session = await auth();
  const viewer = viewerFromSession(session);
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent("/m/feedback")}`);

  const hasAccess =
    isFeedbackAdmin(viewer) || viewer.groups.some((g) => mod.requiredGroups.includes(g));
  if (!hasAccess) notFound();

  // Verzeichnis-Eintrag NACH dem Auth-Riegel (Task 6): nur wer die Prüfung
  // oben übersteht, wird zuordenbar. Idempotent auf `userId` (upsertKnownUser).
  upsertKnownUser(getDb(), {
    userId: viewer.sub,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
    seenAt: new Date(),
  });

  return (
    <Shell variant={mod.shell} moduleKey={mod.key}>
      {children}
    </Shell>
  );
}
