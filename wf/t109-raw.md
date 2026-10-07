VERDICT: PASS
DELTA: verifyReply va decideVerdict da co; thieu chi la noi vao CLI parse.
ACTION: SPEC executor:
parse <file> [hash=<h>] [seq=<n>] [pass=1] [fail=1].
Neu co hash + seq: goi verifyReply(raw, hash, seq); output them verify; mismatch/missing -> exit 2.
Neu co pass=1/fail=1: goi decideVerdict(parsed, {pass, fail}); output them gateVerdict. Khong du dieu kien -> UNCERTAIN.
Khong co option -> giu nguyen output/exit hien tai.
Fixture >=4 case: legacy parse, verify PASS, hash/seq mismatch (exit 2), gate PASS/FAIL/UNCERTAIN.
Test deterministic, zero network/sleep; assert stdout va exit code.
EVIDENCE: wf/pipeline.mjs — exports verifyReply/decideVerdict; CLI hien make/parse/log; T105 accounting da co.
