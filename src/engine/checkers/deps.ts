/**
 * 第 2 项：依赖检查。
 *
 * 在工作目录跑 dependency-cruiser，再读它的 JSON 产物。
 * 判据：severity=error 的违规为空（循环依赖、跨层引用都算违规）。
 *
 * 致谢：dependency-cruiser（MIT）——
 * https://github.com/sverweij/dependency-cruiser
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

const EVIDENCE = 'deps.json';
const DEFAULT_TARGET = 'src';

/** 命令模板：只把 target 填进去。 */
function buildCommand(target: string): string {
  return `depcruise ${target} --output-type json --output-to .workflow/evidence/${EVIDENCE}`;
}

export const depsChecker: Checker = {
  id: 'deps',
  name: '依赖检查',
  evidence: EVIDENCE,
  defaultTarget: DEFAULT_TARGET,
  autoRun: true,
  buildCommand: buildCommand,
  check(data: unknown): CheckResult {
    if (data === null) return missingEvidence(EVIDENCE, buildCommand(DEFAULT_TARGET));
    const summary = asRecord(asRecord(data).summary);
    // 格式不认识时必须报错，不能当「没有违规」。
    if (!Array.isArray(summary.violations)) {
      return {
        ok: false,
        findings: [{ location: EVIDENCE, problem: '证据格式不认识：缺 summary.violations，确认用的是 depcruise --output-type json' }],
        stats: {},
      };
    }
    const violations = asArray(summary.violations);
    const findings: CheckerFinding[] = [];
    let errors = 0;
    for (const item of violations) {
      const violation = asRecord(item);
      const rule = asRecord(violation.rule);
      const severity = asString(rule.severity) || 'error';
      if (severity !== 'error') continue;
      errors += 1;
      const from = asString(violation.from) || '(未知来源)';
      const to = asString(violation.to) || '(未知目标)';
      findings.push({ location: `${from} → ${to}`, problem: `违反依赖规则：${asString(rule.name) || '未命名规则'}` });
    }
    return {
      ok: errors === 0,
      findings,
      stats: { errors, violations: violations.length, modules: asNumber(summary.totalCruised) },
    };
  },
};
