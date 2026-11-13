/**
 * 第 3 项：死代码扫描。
 *
 * 在工作目录跑 knip，再读它的 JSON 产物。
 * 判据：未使用文件 / 导出 / 类型 / 依赖一个都没有。
 *
 * 字段以 knip 6 的真实产物为准（2026-11-13 实测）：
 *   { issues: [{ file, files: [{name}], exports: [], types: [], dependencies: [], devDependencies: [], unlisted: [] }] }
 * 注意未使用文件在 `issues[].files[]`，不在顶层——按顶层读会漏报。
 *
 * 致谢：knip（ISC）—— https://github.com/webpro-nl/knip
 */
import {
  asArray,
  asRecord,
  asString,
  missingEvidence,
  type CheckResult,
  type Checker,
  type CheckerFinding,
} from './types';

const EVIDENCE = 'deadcode.json';

/** knip 自己读 package.json / tsconfig，不需要目标参数；占位保留给统一接口。 */
function buildCommand(_target: string): string {
  return `knip --reporter json > .workflow/evidence/${EVIDENCE}`;
}

/** knip 的可删项：导出 / 类型 / 依赖 / 开发依赖 / 未声明的依赖。 */
const UNUSED_KEYS = ['exports', 'types', 'dependencies', 'devDependencies', 'unlisted'] as const;

export const deadcodeChecker: Checker = {
  id: 'deadcode',
  name: '死代码扫描',
  evidence: EVIDENCE,
  defaultTarget: '',
  autoRun: true,
  buildCommand: buildCommand,
  check(data: unknown): CheckResult {
    if (data === null) return missingEvidence(EVIDENCE, buildCommand(''));
    const root = asRecord(data);
    if (!Array.isArray(root.issues)) {
      return {
        ok: false,
        findings: [{ location: EVIDENCE, problem: '证据格式不认识：缺 issues 数组，确认用的是 knip --reporter json' }],
        stats: {},
      };
    }
    const findings: CheckerFinding[] = [];
    for (const issue of asArray(root.issues)) {
      const record = asRecord(issue);
      const file = asString(record.file) || EVIDENCE;
      for (const item of asArray(record.files)) {
        const name = asString(asRecord(item).name) || asString(item);
        if (name !== '') findings.push({ location: name, problem: '文件没有被任何模块引用' });
      }
      for (const key of UNUSED_KEYS) {
        for (const item of asArray(record[key])) {
          const entry = asRecord(item);
          const name = asString(entry.name) || asString(item) || '(未命名)';
          findings.push({ location: `${file} → ${name}`, problem: `未使用的 ${key}` });
        }
      }
    }
    return { ok: findings.length === 0, findings, stats: { findings: findings.length } };
  },
};
