VERDICT: UNCERTAIN x2 (CodeLocal routing/safety block 2 lan) -> FALLBACK: opencode code local truc tiep
DELTA: C1 state machine don gian da them: STATES/TRANSITIONS/assertTransition, reapStale (timeout -> FAILED, vuot MAX_ATTEMPTS=3 -> DEAD_LETTER), makeEnvelope init CREATED, logEvent kiem tra hop le transition, CLI reap.
ACTION: opencode verify.
EVIDENCE: wf/pipeline.mjs (opencode edit).

## Independent verify (opencode)
- dryrun 6/6: PASS
- S1-S5 assertTransition (hop le + bat hop le + INVALID_STATE): PASS 5/5
- S6-S9 reapStale (khong timeout giu nguyen, het timeout -> FAILED/1, vuot 3 -> DEAD_LETTER, DONE khong reap): PASS 4/4
- S10-S11 logEvent tich hop transition (hop le di qua, bat hop le throw): PASS
=> KET LUAN T119: PASS (fallback per D8: adapter loi 2 lan lien tiep -> local path)
