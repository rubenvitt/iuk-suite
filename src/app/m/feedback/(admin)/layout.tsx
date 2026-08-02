// Die eigenen CSS-Variablen des Moduls (`--fb-*`, `--note-*`). Sie liegen NICHT
// bei antd: antd deklariert `--ant-*` auf seiner Scope-Klasse, nicht auf
// `:root` — eigenes Markup sieht sie nie, und der Fehler ist still. Der Import
// steht im Layout, damit jede Seite unter `(admin)` sie hat, ohne ihn zu
// wiederholen.
import "../_ui/feedback.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import type { SuiteNavItem } from "@/core/shell/types";
import { requireFeedbackAccess } from "../_lib/requireFeedbackAccess";
import { isFeedbackAdmin } from "../_lib/access";

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
  // Der Rueckgabewert, nicht ein zweites `auth()`: die Navigation muss aus
  // DERSELBEN Quelle entscheiden wie der Riegel, sonst laufen sie auseinander.
  const viewer = await requireFeedbackAccess();

  /*
   * `vergleich` hatte bisher keinen festen Einstieg — die Seite existierte,
   * war aber nur ueber eine geratene URL erreichbar. Genau die Prueffrage aus
   * docs/design/README.md: "Hat jede Seite einen Weg in der Oberflaeche?"
   *
   * NUR FUER VOLL-ADMINS, und zwar mit demselben Praedikat wie die Seite
   * selbst (`isFeedbackAdmin` ueber denselben Viewer). Die Gruppenleitung sah
   * den Eintrag vorher auch — und lief mit einem Klick in den 404, den
   * `vergleich/page.tsx` bewusst statt eines 403 wirft, damit die Existenz der
   * Seite nicht verraten wird. Ein Eintrag, der genau dorthin fuehrt, verraet
   * sie trotzdem und ist obendrein eine Sackgasse.
   *
   * Dass beide dasselbe Praedikat auf denselben Viewer anwenden, ist der Punkt:
   * auch im Verzugsfenster veralteter JWT-Gruppen (CLAUDE.md, bis zu eine
   * Stunde) koennen Navigation und Riegel nicht verschiedener Meinung sein.
   */
  const nav: SuiteNavItem[] = [
    { key: "start", title: "Übersicht", href: "/" },
    ...(isFeedbackAdmin(viewer)
      ? [{ key: "vergleich", title: "Vergleich", href: "/vergleich" }]
      : []),
  ];

  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      nav={nav}
    >
      {children}
    </Shell>
  );
}
