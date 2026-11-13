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
} from './types';

const EVIDENCE = 'contract.json';
const DEFAULT_TARGET = 'test';

/** 命令模板：只把 target 填进去。 */
function buildCommand(target: string): string {
  return `vitest run ${target} --reporter=json --outputFile=.workflow/evidence/${EVIDENCE}`;
}

/** 从 vitest JSON 里抽失败用例名：给不出名字时返回空数组。 */
function failedCaseNames(data: unknown): string[] {
  const names: string[] = [];
  for (const suite of asArray(asRecord(data).testResults)) {
    for (const test of asArray(asRecord(suite).assertionResults)) {
      const record = asRecord(test);
      if (asString(record.status) !== 'failed') continue;
      names.push(asString(record.fullName) || asString(record.title) || '(未命名用例)');
    }
  }
  return names;
}

/** 第 1 / 4 项共用的判定：测试结果证据怎么判。 */
export function checkTestEvidence(data: unknown, evidence: string, command: string): CheckResult {
  if (data === null) return missingEvidence(evidence, command);
  const root = asRecord(data);
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
  if (total <= 0) {
    findings.push({ location: evidence, problem: '证据里没有任何用例：空跑不算验证（0 个用例 ≠ 全过）' });
  }
  if (failed > 0) {
    const names = failedCaseNames(data);
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
  buildCommand: buildCommand,
  check(data: unknown): CheckResult {
    return checkTestEvidence(data, EVIDENCE, buildCommand(DEFAULT_TARGET));
  },
};
