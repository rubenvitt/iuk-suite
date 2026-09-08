# Scoped final re-review — consolidated corrections

Reviewed immutable package: `final-fix-review.diff`, complete range `2d6332f3..73ad39fe`. This is the single scoped re-review of F1–F4 and M1/M2, plus possible regressions introduced by that fix package. No implementation, Git, database, test-runner or server changes; this report is the only authored file. No subagents.

## Strengths

The fixes address the named causes without changing domain permissions or rewriting stored audit references. The object scope is enforced twice, at URL parsing and internal storage; denial logging remains at real decisions rather than in shared navigation predicates; delivery evidence is result-aware. Tests include real SQLite persistence and direct page/handler calls, and the repeat test preserves previous attempts' data instead of clearing the whole log.

## Finding dispositions

| Finding | Disposition | Independent review conclusion |
| --- | --- | --- |
| F1 — object identity collision | **Closed** | `storage.ts:40-45` validates objectType, requires module/type with objectRefHash and adds a parameterized object_type equality predicate. `filters.ts:28-33` requires the complete triplet at the URL boundary. The detail action supplies the selected event's module/type/hash and drops its cursor; removal clears that scope together, while a module change removes obsolete type/hash. The UI and registered note explain that event object types remain separate. |
| F2 — page-denial omissions | **Closed with corrected premise** | Six reachable denied page paths now record once with the previously resolved actor immediately before unchanged notFound. The foreign-plan path remains allowed in normal operation; its defensive rejection is separately instrumented and classified. See the explicit correction below. |
| F3 — false download success explanation | **Closed** | The detail paragraph now handles both server download and export with distinct success, denied and failure text. Only success asserts preparation, and it still disclaims proven device receipt. Browser provenance remains separate. |
| F4 — retry fixture pollution | **Closed** | The first browser case creates a fresh UUID email/actor for each invocation and passes it through login, seeding and assertions. The export action filter excludes that actor's separate login event when scope removal clears the module. Previous attempt rows cannot contaminate the 55-export selection. |
| M1 — field error association | **Closed** | AuditFilterError carries a bounded field key; date/range/actor errors identify the relevant field. Inputs expose aria-invalid and the matching error description, and submit focuses the control while preserving its value. Non-field errors retain the summary. |
| M2 — table presentation/width | **Closed** | All six headers use SCHRIFT.kicker; six explicit widths sum to the 960px horizontal extent. The desktop grid child receives min-width:0 so the table can scroll inside it. Supplied 1280px and 1024px screenshots plus the browser geometry/Details assertions support the canonical table behavior. |

### F1 evidence and tradeoff

Reviewed `src/core/audit/storage.test.ts:112-124`, `portal/admin/audit/object-filter.test.ts:18-28`, `read.test.ts:44-53` and the detail/removal DOM tests. The real direct-handler fixture includes feedback groups, evenings, surveys, group_export and another module with the same raw ID; exactly the chosen module/type survives. Malformed or incomplete URL scope is rejected before querying. The parameterization, suite-reader guard, stable cursor and historical hashes remain intact.

The chosen minimum is exact event object type. It intentionally does not combine groups with group_export, and the UI discloses that limitation. This matches the recommended safe repair and is not an unresolved F1 defect. Raw-reference lookup remains an internal API; the URL parser still rejects raw objectRef.

### F2 correction to the original review

My original F2 table incorrectly claimed that an Auftrag person viewing another person's plan reaches a denial. The implementation's real page probe disproved that claim: the existing darfPlanSehen returns true for registered viewers. The original request did not authorize narrowing that access. The fix correctly preserves the permission policy, tests the actual allowed foreign-plan call with no event, and labels the separate forced-false predicate probe as synthetic. The original review must therefore be read as **six actual omissions plus one defensive branch**, not seven reachable omissions.

Reviewed all seven page changes: only imports and an auditDenied/auditActor call before the existing notFound were added. The chosen actor prefers the confirmed Aufgaben person.sub rather than its local row ID. Feedback uses the resolved viewer. No pure predicate, domain transaction, host rule or permission condition changes in this diff.

`src/core/audit/page-denials.test.tsx:51-86` calls the actual default page exports, uses real migrated business/central SQLite databases and the existing permission functions, and mocks only request identity/DB boundaries and the Next 404 sentinel for the normal cases. Six negative cases verify exactly one persisted event; seven allowed cases and two missing-object cases stay quiet. The plan fault is expressly synthetic and restores its spy. These are meaningful server-function proofs; they are not described as a complete live RSC browser proof.

`coverage.test.ts:103-139` and `page-coverage-manifest.json` classify direct module page/layout notFound/redirect decisions using TSX AST traversal, including six denial cases, one defensive denial and deliberate exclusions. This closes the named .tsx omission in the inventory. The manifest does not claim to prove every indirect guard, alias spelling or future alternative denial mechanism automatically; those remain review responsibilities alongside the existing callable/shared-guard coverage. No current missing path was introduced by this fix.

### F3/M1 evidence

Reviewed the result matrix and field-focused DOM tests in `AuditLog.test.tsx`. The matrix covers download/export × success/denied/failure and a separate browser case; the affirmative prepared-response phrase is present only for success. Date and range errors identify the correct date label, preserve the input value, focus the input and expose matching ARIA attributes. The reset regression remains in place.

### F4/M2 browser evidence

Reviewed the full browser-test delta, `/private/tmp/audit-final-fix-browser-accepted.log` and the supplied screenshots `desktop-1280.png`, `desktop-1024.png`, `mobile-dark-details.png` under `/private/tmp/audit-final-fix-shots/`.

The accepted repeat log ends with **2 passed in 24.2s**. The command in the report uses one invocation/worker/server with repeat-each=2; the per-invocation UUID identity is visible in code. The supplied report additionally records two coexisting fixture actors with 55 exports each. I did not open or modify the active test database or repeat the browser test. The 50+5 counts, disjoint IDs, no document overflow, header role and Details visibility after scrolling remain asserted. At 1024px the screenshot shows a contained horizontally scrollable table; offscreen right-hand columns in that static image are expected, and the browser assertion checks reaching Details after scrolling. Mobile dark details remain readable and retain the browser provenance wording.

## Issues

### Critical (Must Fix)

None in the fix package.

### Important (Should Fix)

None remaining from F1–F4, and no new important regression found in the reviewed diff.

### Minor (Nice to Have)

No residual M1/M2 finding and no new concrete minor defect identified in this scoped pass. This is not a claim that all possible future UX improvements are exhausted.

## Verification boundaries

- Read the entire supplied fix diff in bounded consecutive passes, the complete final-fix report, relevant prior finding context, result logs and three screenshots. Did not rerun tests, invoke Git, start a browser/server, or inspect shared runtime databases while parent full gates run.
- Independently read the targeted log's final summary: **23 files, 464 tests passed, 9.35s**, with existing jsdom pseudo-element warnings. The report supplies exit 0 and exact arguments. The subsequent implementation change was the desktop min-width CSS fix, exercised by the accepted repeat; remaining subsequent changes were the test/report corrections.
- Typecheck and scoped lint exit 0 are supplied execution evidence from `final-fix-report.md`; zero-warning scoped lint does not erase the previously disclosed full-repository warnings.
- Premium scanner exit 2 remains an acknowledged compatibility result for the maintained design-document format and Antd Select classification. Actual M1/M2 requirements were repaired separately. No blanket scanner-green claim is justified or made.
- Parent full typecheck/lint/Vitest/build/Playwright at corrected HEAD remains independent acceptance work. Neither the two-case repeat nor predecessor-head full gates replace those final results. No merge, push or deployment is part of this approval.

## Assessment

**Fix package: Approved.** All F1–F4 and M1/M2 are closed, with the F2 reachability correction explicitly recorded. No additional code correction is requested by this scoped review.

**Whole-feature review readiness: Approved subject to the parent's complete final gates and final evidence report.** The original source-review blockers have been addressed; exact final runtime completion must still be established by the ongoing full gate sequence. If those gates pass on the delivery implementation, this review adds no remaining blocker to the requested branch handoff.
