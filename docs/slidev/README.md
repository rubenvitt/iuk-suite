# Live-Quiz in Slidev

`LiveQuiz.vue` bettet die Beamer-Ansicht eines Quiz in eine Folie ein. Du blätterst mit den Slidev-Tasten,
das Quiz geht mit: Klick 0 zeigt die Lobby, jeder weitere Klick den nächsten Schritt. Die Komponente
zielt auf **Slidev v53** (`useSlideContext`, `$clicks`, `$page`, `$renderContext`, `useNav`).

## Einrichten

1. Kopiere `LiveQuiz.vue` in den Ordner `components/` deiner Slidev-Präsentation.
2. Öffne in der IDA das Quiz in der Verwaltung und kopiere den Slidev-Schnipsel. Er sieht so aus:

   ```md
   ---
   clicks: 9
   ---
   <LiveQuiz src="https://…/beamer/…" />
   ```

3. Füge ihn als eigene Folie in deine Präsentation ein. `clicks` ist die Zahl der Schritte minus 1; nach
   dem letzten Klick geht Slidev von selbst zur nächsten Folie.

## Präsenter- und Publikumsfenster

Im Präsentermodus rendern beide Fenster die Folie, also können beide Schritte senden. Das ist
unproblematisch: Schritte sind absolut („gehe zu Schritt n“), der Server nimmt denselben Schritt
nur einmal an. Die „nächste Folie“-Vorschau und die Übersicht laden das Quiz gar nicht erst.

## Achtung: das Secret

Wer die Adresse kennt, kann das Quiz steuern. Foliensätze mit dieser Adresse nicht öffentlich ablegen.
Hat sie jemand Unbefugtes gesehen, erzeuge in der Verwaltung eine neue Adresse.

## Wenn etwas hakt

- **Die Tasten blättern nicht mehr:** Der Fokus liegt im Quiz. Klick einmal neben die Folie, die
  Komponente holt den Fokus sonst selbst zurück.
- **Die Klicks passen nicht:** Hast du das Quiz nach dem Bau der Präsentation geändert, zeigt die
  Folie (im Präsentermodus und im Dev-Server) ein gelbes Feld „Quiz hat jetzt N Schritte — clicks im Frontmatter auf N−1 setzen“. Kopiere den Schnipsel neu oder passe `clicks` an.
- **Leere Folie:** Die Adresse gilt nicht mehr (Secret erneuert). Hol die neue aus der Verwaltung.
