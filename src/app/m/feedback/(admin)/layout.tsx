// Die eigenen CSS-Variablen des Moduls (`--fb-*`, `--note-*`). Sie liegen NICHT
// bei antd: antd deklariert `--ant-*` auf seiner Scope-Klasse, nicht auf
// `:root` — eigenes Markup sieht sie nie, und der Fehler ist still. Der Import
// steht im Layout, damit jede Seite unter `(admin)` sie hat, ohne ihn zu
// wiederholen.
import "../_ui/feedback.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { requireFeedbackAccess } from "../_lib/requireFeedbackAccess";

// full-Shell NUR für die Verwaltung: diese Route-Group liegt eine Ebene über
// `f/` (Task 11), das sein eigenes, chrome-loses Layout hat. Next.js-Layouts
// stapeln sich pro Pfad-Segment, nicht pro Route-Group — `f/` importiert
// dieses Layout hier also nie, weil `(admin)` und `f` Geschwister-Segmente
// unter `feedback/` sind (Route-Groups sind reine Ordnungs-Ordner, tragen
// aber trotzdem die Layout-Verschachtelung nur für ihren eigenen Ast).
//
// Auth-Backstop (Finding 3) und Verzeichnis-Eintrag (Task 6) liegen in
// `_lib/requireFeedbackAccess.ts` — EINE Stelle, gerufen von diesem Layout UND
// vom `(print)`-Layout des Aushangs. Die Auslagerung ist keine Kosmetik: der
// Aushang braucht ein Layout ohne `Shell` (sonst druckt FullShell Header und
// AppSwitcher mit) und verlor damit den vorher hier eingebauten Riegel, obwohl
// er das Gruppen-Secret zeigt (§3.5). Die Seiten-Guards
// (`guardPage`/`assertGroupAccess`) bleiben unverändert die zweite Linie.
export default async function FeedbackAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mod = getModule("feedback");
  await requireFeedbackAccess();

  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      /*
       * `vergleich` hatte bisher keinen festen Einstieg — die Seite existierte,
       * war aber nur ueber eine geratene URL erreichbar. Genau die Prueffrage
       * aus docs/design/README.md: "Hat jede Seite einen Weg in der
       * Oberflaeche?"
       */
      nav={[
        { key: "start", title: "Übersicht", href: "/" },
        { key: "vergleich", title: "Vergleich", href: "/vergleich" },
      ]}
    >
      {children}
    </Shell>
  );
}
