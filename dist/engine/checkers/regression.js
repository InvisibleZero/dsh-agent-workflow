/**
 * 第 7 项：回归与压测。
 *
 * 用 autocannon 跑压测（随插件分发），结果落 `.workflow/evidence/regression.json`。
 * 压测目标没有合理默认，所以调用时必须传 target（形如 http://127.0.0.1:3000）。
 *
 * 两种证据格式都认：
 *   1. autocannon 原始结果（`requests.total` / `errors` / `timeouts` / `duration`）
 *   2. 约定格式（`total` / `failed` / `durationMs`）——项目自己跑压测时按这个落盘
 *
 * 致谢：autocannon（MIT）—— https://github.com/mcollina/autocannon
 */
import { asNumber, asRecord, missingEvidence, } from './types';
const EVIDENCE = 'regression.json';
/** 命令模板：target 是压测地址。 */
function buildCommand(target) {
    return `npx autocannon ${target} -j > .workflow/evidence/${EVIDENCE}`;
}
export const regressionChecker = {
    id: 'regression',
    name: '回归与压测',
    evidence: EVIDENCE,
    defaultTarget: '',
    autoRun: true,
    requiresTarget: true,
    buildCommand,
    check(data) {
        if (data === null)
            return missingEvidence(EVIDENCE, `${buildCommand('http://127.0.0.1:3000')}`);
        const root = asRecord(data);
        // 1. autocannon 原始结果
        if (typeof root.requests === 'object' && root.requests !== null) {
            const requests = asRecord(root.requests);
            const total = asNumber(requests.total) || asNumber(requests.average) || asNumber(requests.sent);
            const failed = asNumber(root.errors) + asNumber(root.timeouts);
            const durationMs = Math.round(asNumber(root.duration) * 1000);
            const findings = [];
            if (total <= 0)
                findings.push({ location: EVIDENCE, problem: '压测没有产生任何请求：空跑不算验证' });
            if (failed > 0)
                findings.push({ location: EVIDENCE, problem: `${failed}/${total} 个请求失败（错误 + 超时）` });
            return { ok: findings.length === 0, findings, stats: { total, failed, durationMs } };
        }
        // 2. 约定格式
        if (typeof root.total === 'number' && typeof root.failed === 'number') {
            const total = asNumber(root.total);
            const failed = asNumber(root.failed);
            const durationMs = asNumber(root.durationMs);
            const findings = [];
            if (total <= 0)
                findings.push({ location: EVIDENCE, problem: '证据里没有任何用例：空跑不算回归验证' });
            if (failed > 0)
                findings.push({ location: EVIDENCE, problem: `${failed}/${total} 个用例失败` });
            return { ok: findings.length === 0, findings, stats: { total, failed, durationMs } };
        }
        return {
            ok: false,
            findings: [{ location: EVIDENCE, problem: '证据格式不认识：既不是 autocannon 原始结果，也不是 { total, failed, durationMs }' }],
            stats: {},
        };
    },
};
//# sourceMappingURL=regression.js.map