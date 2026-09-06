# Final review corrections F1–F4, M1–M2

Base: `2d6332f3ae214eae2880bed04c06dfb1964f4a2f`, branch `codex/suite-audit-log`, worktree `/private/tmp/iuk-suite-audit-log`. This is one consolidated correction wave. No merge, push or deployment. The parent-owned delivery report was neither edited nor staged.

## Decisions and corrections

**F1 — exact object scope.** The URL/read filter adds validated `objectType`. A stored-reference hash now requires both `module` and `objectType` in storage, independently of UI validation. `Nur dieses Objekt` replaces the module/type/hash from the selected event and drops the cursor. Removing that scope clears all three together; selecting a different module clears its old type/hash. Other filters remain independent. The scope explanation explicitly says that event object types are separate, including table versus delivery types. There is no inferred groups/group_export equivalence. Historical references and outboxes are unchanged. Raw-reference lookup remains the existing internal API; raw IDs are still forbidden in the URL parser. The direct data handler now demonstrably excludes feedback evenings, surveys, group_export and another module's group with the same raw ID as the chosen group. No table data or auth API was redesigned.

**F2 — six reachable page denials, one defensive branch.** The existing Aufgaben task, Freigaben, Routinen, Verteilen and Personen decisions, and Feedback Vergleich decision now call `auditDenied` immediately before their unchanged `notFound`. The actor comes from the already server-resolved Aufgaben person (`sub`, not its local row ID) or Feedback viewer. There is no new auth lookup or auth/logging import cycle, no event in a pure permission predicate, and no success/page-view event.

The review's seventh *reachable* denial was factually wrong: `darfPlanSehen` currently returns true for all registered viewers, including an Auftrag person viewing another person's plan. The real initial probe resolved successfully. Parent accepted this correction. That permission policy stays unchanged. Its existing defensive rejection branch is instrumented, but classified separately. A real permitted foreign-plan probe stays quiet; a separately named **synthetic predicate fault** exercises the otherwise unreachable rejection, preserving 404 and exactly one persisted event. It is not claimed as a formerly reachable denial.

The new TSX AST inventory classifies all **54 direct module page/layout notFound/redirect decisions**, preserving explicit reasons for ordinary missing objects, resource-type mismatches, unknown help keys, canonical parent-ID mismatches, login/legacy routing, and the five defensive Zeichen identity checks. Existing Feedback ownership catches and the Portal audit guard are classified as delegated logging. It does not relabel every 404 as a permission violation or claim that every indirect guard is a direct page branch; the existing callable inventory and shared guards remain in force. New direct decisions or changed conditions must be classified. Six actual negative Default-Page calls persist exactly one central SQLite event; seven allowed calls and two ordinary missing-object calls remain quiet. Permission predicates and existing domain transactions are untouched.

**F3 — truthful delivery evidence.** Server download and export details share a result-aware paragraph. Only success claims a prepared response, with the existing explicit limit that device receipt is unconfirmed. Denied says the server refused delivery; failure says preparation is not confirmed. The separate browser claim remains separate. The DOM matrix exercises download/export × success/denied/failure plus browser provenance.

**F4 — attempt-isolated pagination.** Every retry/repeat generates a new UUID email and matching actor ID, threaded through login, fixture and assertions. Each fixture contributes exactly 55 export rows; no broad cleanup is added. The committed action filter selects exports so the login event is not accidentally included when removing the object scope also removes its module. Both page response bodies retain the required 50 + 5 count and disjoint event IDs. Repeat validation uses one Playwright invocation, one worker and the same webserver/database for both attempts.

**M1 — field validation.** `AuditFilterError` carries an optional field identifier. Invalid start/end dates identify their field in text, range errors identify the end field, and actor-length errors identify the actor field. The affected input exposes aria-invalid and references the rendered error; submit focuses that field and preserves values. Non-field failures retain the focusable general summary. DOM probes cover start/end/range association and focus.

**M2 — canonical table contract.** All six titles render `SCHRIFT.kicker`. Explicit widths 190 + 130 + 200 + 200 + 120 + 120 equal scroll.x 960. The real 1024px probe exposed the grid child's automatic minimum width: the audit grid was 752px, the table child 960px and document 1216px. Applying min-width:0 to that grid child allows the table's existing horizontal scroller to contain it. This is measured layout evidence, not a guessed specificity change. Desktop 1280px and 1024px probes verify no document overflow, uppercase header role and reachable Details after horizontal scrolling. The registered feature note explains the object scope.

## Design and runtime sources

Read the approved feature spec, complete final review, final-review-context, Task 1 API and Task 2/3 reports. Applied frontend-design-premium with its installed upstream frontend-design, canonical resolution and verification references. The maintained `docs/design/README.md` and `feedback-admin.md` remain authority; no competing DESIGN.md, token palette or UX architecture was introduced. Read the installed Next use-client and not-found API guides before edits. Read and applied systematic-debugging for the measured browser failure. Existing Antd controls, German locale, UTC dates, suite typography, 44px density and CSS mobile breakpoint remain the canonical owners.

## Commands and results

All shell commands use `rtk proxy`; Node 22 uses:

```
PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:/private/tmp/iuk-suite-audit-log/node_modules/.bin:$PATH
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false
```

Initial RED (before implementation):

```
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/vitest/vitest.mjs run src/core/audit/page-denials.test.tsx src/core/audit/storage.test.ts src/app/m/portal/admin/audit --maxWorkers=2
```

Exit **1**, 16 failed / 46 passed; `/private/tmp/audit-final-fix-red.log`. Six failures showed absent persisted denial rows, F1 showed the same-ID mix/direct invalid-filter acceptance/wrong clicked module, F3/M1 showed incorrect evidence/focus. One failure instead disproved the review's Plan reachability premise; it was reclassified rather than changing permission semantics. First corrected narrow run: exit **0**, 62/62 in five files, `/private/tmp/audit-final-fix-green.log`.

Targeted regression after the additional real handler and defensive/inventory proofs:

```
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/vitest/vitest.mjs run src/core/audit src/app/m/portal/admin/audit 'src/app/m/aufgaben/a/[id]/page.test.tsx' 'src/app/m/aufgaben/plan/[personId]/page.test.tsx' src/app/m/aufgaben/freigaben/page.test.tsx src/app/m/aufgaben/routinen/page.test.tsx src/app/m/aufgaben/verteilen/page.test.tsx src/app/m/aufgaben/personen/page.test.tsx 'src/app/m/feedback/(admin)/vergleich/page.test.tsx' src/app/m/aufgaben/_lib/zugang.test.ts src/app/m/feedback/_lib/access.test.ts src/app/m/portal/_lib/neuigkeiten/register.test.ts --maxWorkers=2
```

Exit **0**, **23 files / 464 tests**, 9.35s; `/private/tmp/audit-final-fix-targeted.log`. Existing jsdom pseudo-element warnings remain.

Typecheck (`node node_modules/typescript/bin/tsc --noEmit --pretty false`) and scoped ESLint (`node node_modules/eslint/bin/eslint.js`, all changed TS/TSX except generated next-env plus the two new runtime test files) passed, exit **0**. An initial test-only AuditView union error was fixed before the passing typecheck. Final post-browser checks are recorded below.

### Browser diagnostics and repeat

All browser commands use the environment above plus `WATCHPACK_POLLING=1000` and the already authorized Chromium permissions:

```
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:/private/tmp/iuk-suite-audit-log/node_modules/.bin:$PATH WATCHPACK_POLLING=1000 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/@playwright/test/cli.js test e2e/suite-audit.spec.ts --workers=1 --trace=on --grep 'Suite-Admin:' --repeat-each=2
```

The first repeat exited **1** with the measured narrow-desktop overflow (`audit-final-fix-browser.log`). A one-attempt diagnostic exited **1**, identifying width1024/document1216 (`audit-final-fix-browser-geometry.log`); 1280 was already contained. After the CSS fix, both attempts reached page2 but exposed **six** rows because scope removal correctly also cleared the module and included the same actor's login (`audit-final-fix-browser-green.log`, exit1). The fixture now commits action=export. A diagnostic attempt to select the virtualized last option through its absent DOM node was interrupted (exit130); the final test uses the verified ArrowUp/Enter combobox contract. One restart was refused due to the prior interrupted run's own servers (exit1); only identified PIDs7151/7296 with matching worktree CWD and ports were stopped, after which ports were free. None of these runs is accepted as the final repeat.

Final accepted repeat: **2 passed in 24.2s, exit0**, `/private/tmp/audit-final-fix-browser-accepted.log`. Both runs complete navigation, exact object filtering/removal, 50+5 disjoint pagination, 1280/1024 layout checks, mobile cards and dark details. A read of the same final SQLite file confirmed two distinct UUID fixture actors with **55 export rows each**, proving that the second attempt coexists with the first rather than relying on a server restart or cleanup. No page errors were reported.

Screenshots copied to `/private/tmp/audit-final-fix-shots/` before parent gates can replace test-results. Visually inspected `desktop-1280.png`, `desktop-1024.png` and `mobile-dark-details.png`. The narrow desktop table scrolls within its own area; the test explicitly scrolls to Details and verifies that header is in the viewport. The DOM matrix covers truthful server results, and the screenshots preserve the separate browser explanation.

### Premium static scanner

```
rtk proxy python3 /Users/rubeen/.codex/plugins/cache/openai-curated-remote/frontend-design-premium/1.4.0/skills/frontend-design-premium/scripts/audit_project.py /private/tmp/iuk-suite-audit-log --mode strict --config /private/tmp/audit-task3-premium-config.json --output /private/tmp/audit-final-fix-premium.json
```

Exit **2**, same three compatibility findings: canonical table formatting not matching its required map columns; capitalized Antd Select misclassified as native select; no DESIGN.md despite the explicitly maintained docs/design authority. The approved project authority remains unchanged. Actual M1/M2 omissions were fixed and runtime-tested rather than dismissed with these scanner mismatches. An initial unscoped scanner was interrupted (exit130) and replaced by the already used Task3 scope/config; no scanner success is claimed.

## Handoff boundary

Full-repository Vitest, production build and full405 Playwright remain parent gates on the committed correction. No predecessor or diagnostic run is represented as a final full gate. Final post-browser typecheck: **exit0**, empty `/private/tmp/audit-final-fix-typecheck-final.log`. Final scoped ESLint: **exit0**, zero warnings/errors in 19 files, empty `/private/tmp/audit-final-fix-lint-final.log`; exact file arguments are in `/private/tmp/audit-final-fix-lint-final-paths.json`. These rechecks include the final e2e changes. Only CSS/test/report changed after the 464-test regression; the CSS is exercised by the accepted browser repeat.

`rtk proxy git -c core.fsmonitor=false diff --check`: **exit0**. `rtk proxy lsof -nP -iTCP:3100 -iTCP:3310 -sTCP:LISTEN`: no output, **exit1**, both own testservers stopped. Reverted only the two generated next-env.d.ts dev-type imports to their tracked forms; no next-env diff remains. No owned runner remains active. The correction commit includes only the explicitly owned implementation/tests, registered feature-note clarification and this report.
