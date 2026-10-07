# T124 — Architect (tab0, Think ON) reply

VERDICT: PASS

DELTA: Đáng tích hợp ngay: (1) Prereg freeze + immutable baseline — T125: lưu hash bộ spec/acceptance trước execution, mọi thay đổi sau freeze ⇒ BLOCKED; acceptance: sửa 1 byte prereg thì gate phát hiện. (2) Independent verifier — T126: verifier tách khỏi orchestrator, ưu tiên Node hiện có + fixture self-test; acceptance: verifier tự chấm đúng 3 fixture và orchestrator không thể tự bypass verdict. (3) Per-task evidence bundle — T127: chuẩn hóa SHA256SUMS + provenance cho input/raw/output/evidence; acceptance: recompute hash toàn bundle PASS, đổi 1 file ⇒ FAIL. (4) Ground-truth isolation — T128: tách expected results/secret test oracle khỏi execution/reviewer context; acceptance: reviewer không đọc được ground truth nhưng verifier vẫn đối chiếu được. (5) Parallel swarm — T129: chỉ lấy pattern song song khi cần diversity/review, không thay control-plane tuần tự; acceptance: 3 worker độc lập, failure một worker không làm mất kết quả hai worker còn lại.

Không cần lấy: 3 Chrome/CDP profile, browser-use/CloakBrowser, Ollama fallback, UI/board orchestration; đây là transport/runtime của repo kia, không thuộc vai trò ARCHITECT/control-plane hiện tại. Pipeline/swarm cũng không nên thay envelope + gate/state machine hiện có.

ACTION: Thực thi theo thứ tự T125 → T126 → T127 → T128 → T129; T125–T128 là governance/evidence foundation, T129 làm sau và chỉ khi có use-case parallel review rõ ràng.

EVIDENCE: Repo redsonvietnam/ai-orchestrator theo INPUT T124; đối chiếu workflow D:\ai-workflow: DECISIONS.md, wf/pipeline.mjs, wf/report.mjs, T121–T123; META-WF-V1 experiments/META-WF-V1/prereg/, verifier/, tasks/F1-F5/, SHA256SUMS, provenance.json.
