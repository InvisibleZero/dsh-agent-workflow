/**
 * 第 1 项：契约测试。
 *
 * 只读测试运行结果（vitest `--reporter=json` 的产物），不自己跑测试。
 * 判据：有用例、没有失败；空跑不算数——「0 个用例」和「全过」是两回事。
 */
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  missingEvidence,
  type CheckResult,
  type Checker,
  type CheckerFinding,
  type CheckerTools,
} from './types';
import type { Stack } from './stack';
import { normalizePytestReport } from './normalize';

const EVIDENCE = 'contract.json';
const DEFAULT_TARGET = 'test';

/** 各技术栈的契约测试取证命令；python 用宿主定位到的绝对路径，不靠 PATH。 */
const CONTRACT_COMMANDS: Record<Stack, (target: string, tools: CheckerTools) => string> = {
  js: (target) => `vitest run ${target} --reporter=json --outputFile=.workflow/evidence/${EVIDENCE}`,
  python: (_target, tools) => `"${tools.projectPython ?? tools.python ?? 'python'}" -m pytest --json-report --json-report-file=.workflow/evidence/${EVIDENCE}`,
};

/** 命令模板：默认 JS，只把 target 填进去。 */
function buildCommand(target: string): string {
  return CONTRACT_COMMANDS.js(target, {});
}

/** 从 vitest JSON 里抽失败用例名：给不出名字时返回空数组。 */
function failedCaseNames(evidence_json: unknown): string[] {
  const names: string[] = [];
  for (const suite of asArray(asRecord(evidence_json).testResults)) {
    for (const test of asArray(asRecord(suite).assertionResults)) {
      const record = asRecord(test);
      if (asString(record.status) !== 'failed') continue;
      names.push(asString(record.fullName) || asString(record.title) || '(未命名用例)');
    }
  }
  return names;
}

/** 第 1 / 4 项共用的判定：测试结果证据怎么判。 */
export function checkTestEvidence(evidence_json: unknown, evidence: string, command: string): CheckResult {
  if (evidence_json === null) return missingEvidence(evidence, command);
  const root = asRecord(evidence_json);
  // 格式不认识时必须报错，不能当「0 个失败」——那会把坏证据误判成通过。
  if (typeof root.numTotalTests !== 'number' || typeof root.numFailedTests !== 'number') {
    return {
      ok: false,
      findings: [{ location: evidence, problem: '证据格式不认识：缺 numTotalTests / numFailedTests，确认用的是 vitest --reporter=json' }],
      stats: {},
    };
  }
  const total = asNumber(root.numTotalTests);
  const failed = asNumber(root.numFailedTests);
  const findings: CheckerFinding[] = [];
  // 退出码非 0 但计数值像「全过」= 测试运行本身出了问题，直接判不合格（fail-closed）。
  // pytest 的 exitcode 由 normalizePytestReport 带进来；vitest 产物没有这个字段，不受影响。
  if (typeof root.exitcode === 'number' && root.exitcode !== 0 && failed === 0) {
    findings.push({
      location: evidence,
      problem: `测试运行退出码 ${root.exitcode}（非 0）：即使计数值像全过，也判不合格（fail-closed）`,
    });
  }
  if (total <= 0) {
    findings.push({ location: evidence, problem: '证据里没有任何用例：空跑不算验证（0 个用例 ≠ 全过）' });
  }
  if (failed > 0) {
    const names = failedCaseNames(evidence_json);
    if (names.length === 0) findings.push({ location: evidence, problem: `${failed} 个用例失败` });
    else for (const name of names) findings.push({ location: name, problem: '用例失败' });
  }
  if (root.success === false && failed === 0) {
    findings.push({ location: evidence, problem: '测试报告标了 success=false，但没给出失败数：证据不完整' });
  }
  return { ok: findings.length === 0, findings, stats: { total, failed } };
}

export const contractChecker: Checker = {
  id: 'contract',
  name: '契约测试',
  evidence: EVIDENCE,
  defaultTarget: DEFAULT_TARGET,
  autoRun: true,
  buildCommands: CONTRACT_COMMANDS,
  normalizers: { python: normalizePytestReport },
  buildCommand: buildCommand,
  check(evidence_json: unknown): CheckResult {
    return checkTestEvidence(evidence_json, EVIDENCE, buildCommand(DEFAULT_TARGET));
  },
};
