# Release Notes — die Langfassung

Die Kurzregeln stehen in `CLAUDE.md` unter „Release Notes"; hier stehen Begründung, Grenzen und der
Stil im Einzelnen. `register.test.ts` prüft, was davon maschinell prüfbar ist.

**Die meisten Änderungen bekommen keine Notiz.** Das ist die erste Regel, nicht die letzte:
die Notizen sind das einzige, was die Suite von sich aus an ihre Anwender schreibt, und eine
Liste, in der alles steht, liest niemand. Die Probe ist nicht „hat sich etwas geändert?",
sondern: **Würde jemand ohne diese Notiz fragen — oder etwas suchen, das nicht mehr da ist?**

| Notiz | Keine Notiz |
| --- | --- |
| Etwas geht, das vorher nicht ging | Ein Fehler ist behoben, den kaum jemand gemeldet hat |
| Ein Weg oder ein Ort ändert sich | Eine Beschriftung, eine Farbe, ein Abstand, ein Zahlenformat |
| Etwas verschwindet oder pausiert | Etwas ist schneller oder stabiler geworden |
| Ein Name ändert sich | Umbauten unter der Haube, Tests, CI, Abhängigkeiten |
| Eine Einschränkung, die man kennen muss | Eine Fläche sieht aufgeräumter aus als gestern |

Im Zweifel: **keine Notiz.** Eine ausgelassene Kleinigkeit merkt niemand; eine Liste voller
Kleinigkeiten kostet die Glaubwürdigkeit der Einträge, die zählen. Nicht verhandelbar sind
nur **ein neues Feature** und **eine Änderung, nach der jemand vergeblich sucht** — für beide
gehört die Notiz in denselben Commit wie die Änderung, denn nachgetragen wird sie nicht.

**Ein Absatz. Ein bis drei Sätze.** Das ist der Normalfall, nicht das Minimum. Ein neues
Feature darf einen zweiten Absatz haben; **drei Blöcke sind die harte Obergrenze** und kein
Ziel. Die Zahlen stehen in `NOTIZ_GRENZEN` (`typen.ts`) und werden von `register.test.ts`
geprüft — 3 Blöcke, 320 Zeichen je Block, 640 Zeichen gesamt, 60 Zeichen im Titel. Wer an
eine Grenze stößt, hat fast nie eine zu lange Notiz, sondern **zwei Änderungen in einer
Datei**; dann sind es zwei Notizen.

**Was fast immer wegfällt**, wenn eine Notiz zu lang ist: die Begründung der Entscheidung
(„das ist nicht derselbe Weg mit einem zweiten Knopf …"), die Vorgeschichte („bisher musstest
du …" — ein Halbsatz reicht, wenn überhaupt), die Beruhigung („deine Daten bleiben
selbstverständlich erhalten") und die Aufzählung der Nebenwirkungen. Was gleich bleibt,
schreibst du nur hin, wenn die Änderung so aussieht, als nähme sie etwas weg.

**Eine Datei je Notiz**, `src/app/m/portal/_lib/neuigkeiten/notizen/<modul>/<YYYY-MM-DD>-<slug>.ts`,
plus **eine Zeile in `register.ts`**. Das Dreieck ist Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔
Registerzeile; `register.test.ts` liest das Verzeichnis und hält alle drei zusammen — eine nicht
eingetragene Notiz ist ein roter Test und keine stille Auslassung. Kein Markdown, kein `fs`, keine
Datenbank: die Notiz ist ein importiertes Modul und liegt im Bundle (Begründung im Kopf von
`typen.ts`, kurz: alles andere kostet eine `COPY`-Zeile im `Dockerfile`, die zu vergessen still ist).
`datum` ist der Tag des **Rollouts**, nicht des Commits.

**Sichtbar ausschließlich im Portal**, unter `/neuigkeiten`. Kein Modul importiert
`portal/_lib/neuigkeiten` — auch dafür gibt es einen Quelltext-Scan in `register.test.ts`, weil ein
`import` diese Regel bricht, ohne dass ein Tor rot wird. **Wer eine Notiz sieht, entscheidet die
Kachelliste**: sichtbar sind die Apps aus `visibleSwitcherModules`, keine zweite Rechteprüfung
daneben. Modultitel und Zeichen stehen in `core/registry.ts` und werden in der Notiz **nicht**
wiederholt.

**Der Stil ist verbindlich, nicht empfohlen:**

* **Für Anwender.** Kein Dateiname, kein Funktionsname, keine Versionsnummer, kein Commit, kein
  Ticket, kein Framework. Wenn ein Satz nur mit Kenntnis des Quelltextes verständlich ist, gehört er
  nicht hinein.
* **Du-Form, Präsens, aktiv** — wie der Rest der Oberfläche.
* **Der erste Satz sagt, was jetzt anders ist.** Der erste Absatz ist zugleich die Zusammenfassung;
  ein Teaser-Feld gibt es deshalb nicht. Kein „In diesem Release", kein „Wir freuen uns".
* **Nenne den Weg mit den Wörtern, die auf dem Bildschirm stehen** („Verwaltung → Checklisten",
  „Von allen Geräten abmelden"). Eine Notiz, nach der man suchen muss, hat ihre Aufgabe verfehlt.
* **Kein Adjektiv statt einer Aussage.** Verboten sind Werbewörter (nahtlos, intuitiv,
  leistungsstark, ab sofort noch besser), Ausrufezeichen und Emoji — `register.test.ts` prüft die
  häufigsten.
* **Höchstens ein `hinweis` je Notiz, und nur wenn der Leser wirklich etwas tun muss.** Ein
  Hinweis ist eine Aufforderung, keine Auskunft. Zwei Aufforderungen heißen: zwei Notizen.
* **Der Titel ist eine Aussage** („Fahrzeug-Checklisten als PDF"), kein Etikett („Neues Feature:
  PDF-Export"), und wiederholt den App-Namen nicht.
* **Kein Markdown im Text.** Er wird als Textknoten gerendert; `**fett**` käme mit Sternchen auf dem
  Bildschirm an. Auch das prüft `register.test.ts`.
