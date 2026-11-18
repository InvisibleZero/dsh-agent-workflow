/**
 * 第 4 项：边界测试。
 *
 * 和契约测试同一类证据（都是测试运行结果），只是证据文件与默认目标分开：
 * 一项一次运行，不能拿同一份报告报两项。
 */
import { checkTestEvidence } from './contract';
import type { CheckResult, Checker, CheckerTools } from './types';
import type { Stack } from './stack';
import { normalizePytestReport } from './normalize';

const EVIDENCE = 'boundary.json';
const DEFAULT_TARGET = 'test/boundary';

/** 各技术栈的边界测试取证命令；python 用宿主定位到的绝对路径，不靠 PATH。 */
const BOUNDARY_COMMANDS: Record<Stack, (target: string, tools: CheckerTools) => string> = {
  js: (target) => `vitest run ${target} --reporter=json --outputFile=.workflow/evidence/${EVIDENCE}`,
  python: (_target, tools) => `"${tools.projectPython ?? tools.python ?? 'python'}" -m pytest --json-report --json-report-file=.workflow/evidence/${EVIDENCE}`,
};

/** 命令模板：默认 JS，只把 target 填进去。 */
function buildCommand(target: string): string {
  return BOUNDARY_COMMANDS.js(target, {});
}

export const boundaryChecker: Checker = {
  id: 'boundary',
  name: '边界测试',
  evidence: EVIDENCE,
  defaultTarget: DEFAULT_TARGET,
  autoRun: true,
  buildCommands: BOUNDARY_COMMANDS,
  normalizers: { python: normalizePytestReport },
  buildCommand: buildCommand,
  check(evidence_json: unknown): CheckResult {
    return checkTestEvidence(evidence_json, EVIDENCE, buildCommand(DEFAULT_TARGET));
  },
};
