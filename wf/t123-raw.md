VERDICT: UNCERTAIN lan 1 (lease) + lan 2 (routable path) -> FALLBACK LOCAL
DELTA: hash-chain: logEvent gan prevHash/eventHash, CLI verifychain, exit 4 neu chain dut.
ACTION: Phase 2 done - T121/T122/T123 merged.
EVIDENCE: wf/pipeline.mjs verifyChain/computeEventHash/lastEventHash; tamper test PASS.

## Independent verify (opencode)
- dryrun 6/6: PASS
- (a) LOG legacy (23 dong khong hash) -> ok exit 0, legacy=23: PASS
- (b) append 2 event chain -> checked=2 exit 0; TCHAINT2.prevHash = TCHAINT1.eventHash: PASS
- (c) sua verdict 1 event cu -> linkOk=true hashOk=false, exit 4: PASS (acceptance spec)
- (d) sua prevHash cua event sau -> linkOk=false hashOk=false, exit 4: PASS
- backward-compatible (dong legacy bo qua): PASS
=> KET LUAN T123: PASS (executor blocked x2, fallback local theo quy tac)
