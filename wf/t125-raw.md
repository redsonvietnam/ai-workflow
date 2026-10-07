VERDICT: UNCERTAIN lan 1 (terminal CodeLocal routing blocked, code da vao) -> verify local
DELTA: prereg freeze/check + exit 5 + gate hook da them.
ACTION: Proceed T126.
EVIDENCE: pipeline f9ac077e...184354; fix bug '\\n' literal -> newline; test local PASS.

## Independent verify (opencode)
- freeze 2 file exit 0: PASS
- check chua sua -> 'prereg: PASS' exit 0: PASS
- sua 1 byte -> bang ke HASH_MISMATCH exit 5: PASS
- gate hook -> reason PREREG_MISMATCH exit 5: PASS
- khong manifest -> SKIP backward-compat, dryrun 6/6: PASS
=> KET LUAN T125: PASS (CodeLocal code, terminal local, fix 1 bug '\\n' sau khi code)
