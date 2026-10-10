# W1-2 — Pipeline deletion audit (952851e..e9d4bbf)

Scope: git diff 952851e e9d4bbf -- wf/pipeline.mjs
Source reviewed: commit diff and wf/pipeline.mjs at both endpoints. This is a functional deletion inventory; code moved into helpers is distinguished from commands/guards that disappeared.

## Classification

| Change in the range | Classification | W1-2 disposition |
|---|---|---|
| state-validate CLI branch removed (S01–S14 checks) | Accidental CLI regression; confirmed by the current F3 suite | Restore from 952851e, adapting only to current structure |
| log-event CLI branch removed | Accidental regression under the current owner instruction to restore F3 | Restore the original command branch; do not reuse DECISIONS.md D4, which already means Git as control plane |
| make lost task-ID validation while still parsing only key=value arguments | Accidental regression; positional T157 becomes an o key with value undefined, then o.task is persisted | Add explicit argument-shape, required task=, and shared task-ID validation before side effects |
| bundle / bundle-check CLI-level task-ID checks removed | Guard moved partly into lower-level bundle functions; avoid duplicate regexes and enforce the shared validator at the common boundary | Centralize on validateTaskId; retain fail-closed exit semantics |
| verifyChain() stopped adding reason: CHAIN_BROKEN when the chain is broken | Accidental loss of a stable failure reason (F3 S14 expects it) | Restore reason on broken chain |
| prereg check changed from structured JSON to human-readable PASS/SKIP or a Markdown failure table | Observable CLI output contract changed; not required for W1-2 | Preserve current behavior; do not broaden this task |
| Inline apply implementation was replaced by runApply / ApplyReject flow, with lock/temp cleanup and error conversion moved into helpers | Intended F2 refactor, but F2 JSONL logging is still unwired per the separate W1-3 finding | Leave untouched; W1-2 must not change F2 |
| writeOutAndExit / outcome reporting and path normalization were refactored/adjusted | F2/path-policy implementation changes, not proof that the state/CLI deletions were intentional | Leave untouched in W1-2 |

## Evidence and boundary

- The diff confirms both state-validate and log-event were present at 952851e and absent at e9d4bbf.
- The assessment asks whether log-event is still needed (its D4 label conflicts with the existing DECISIONS.md D4, which means Git as control plane). The current owner instruction explicitly requests restoration, so this task restores it and does not overwrite or reuse DECISIONS.md D4.
