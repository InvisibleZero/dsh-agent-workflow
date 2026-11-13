/**
 * 第 4 项：边界测试。
 *
 * 和契约测试同一类证据（都是测试运行结果），只是证据文件与默认目标分开：
 * 一项一次运行，不能拿同一份报告报两项。
 */
import { checkTestEvidence } from './contract';
const EVIDENCE = 'boundary.json';
const DEFAULT_TARGET = 'test/boundary';
/** 命令模板：只把 target 填进去。 */
function buildCommand(target) {
    return `vitest run ${target} --reporter=json --outputFile=.workflow/evidence/${EVIDENCE}`;
}
export const boundaryChecker = {
    id: 'boundary',
    name: '边界测试',
    evidence: EVIDENCE,
    defaultTarget: DEFAULT_TARGET,
    autoRun: true,
    buildCommand: buildCommand,
    check(data) {
        return checkTestEvidence(data, EVIDENCE, buildCommand(DEFAULT_TARGET));
    },
};
//# sourceMappingURL=boundary.js.map