/**
 * 构建与冒烟检查（表现层小验收 / check_build）。
 *
 * 跑插件自带脚本 build-check.mjs（npm run build + npm run smoke），读 build.json 判定：
 * build 或 smoke 退出码非 0 都不合格。
 */
import { asNumber, asRecord, missingEvidence } from './types';
const EVIDENCE = 'build.json';
export const buildChecker = {
    id: 'build',
    name: '构建与冒烟',
    evidence: EVIDENCE,
    defaultTarget: '',
    autoRun: true,
    script: 'build-check.mjs',
    check(evidence_json) {
        if (evidence_json === null)
            return missingEvidence(EVIDENCE, 'node scripts/build-check.mjs');
        const root = asRecord(evidence_json);
        if (typeof root.build_exit !== 'number') {
            return {
                ok: false,
                findings: [{ location: EVIDENCE, problem: '证据格式不认识：缺 build_exit，确认用的是 build-check.mjs' }],
                stats: {},
            };
        }
        const buildExit = asNumber(root.build_exit);
        const smokeExit = asNumber(root.smoke_exit);
        const stats = { build_exit: buildExit, smoke_exit: smokeExit, bytes: asNumber(root.bytes) };
        if (buildExit !== 0) {
            return { ok: false, findings: [{ location: EVIDENCE, problem: `build 失败（exit=${buildExit}）` }], stats };
        }
        if (smokeExit !== 0) {
            return { ok: false, findings: [{ location: EVIDENCE, problem: `smoke 失败（exit=${smokeExit}）` }], stats };
        }
        return { ok: true, findings: [], stats };
    },
};
//# sourceMappingURL=build.js.map