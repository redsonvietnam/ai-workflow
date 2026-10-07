VERDICT: UNCERTAIN (executor - terminal bi block)
DELTA: C4 hook added: terminal transition requires from/to + finalHash; payload stripped; report audits missing evidence.
ACTION: opencode chay test deterministic + node wf\pipeline.mjs.
EVIDENCE: pipeline.mjs 3ecef3bb...68bd7; report.mjs d56c745e...ddaf4.

## Independent verify (opencode)
- N1 terminal thieu finalHash -> throw TERMINAL_EVIDENCE_REQUIRED: PASS
- N2 terminal thieu from -> throw: PASS
- N3 terminal day du -> ghi duoc, payload (request/reply) bi strip, chi con byte counts: PASS
- N4 non-terminal khong can finalHash -> ghi duoc: PASS
- dryrun truoc/sau C4: 6/6 ca hai (khong hong), report.mjs chay duoc (log=16 events)
=> KET LUAN T116: PASS
