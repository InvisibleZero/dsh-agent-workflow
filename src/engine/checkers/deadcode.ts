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
import { normalizeVulture } from './normalize';

const EVIDENCE = 'deadcode.json';

/**
 * vulture 要排除的目录：虚拟环境 / 依赖 / 缓存。
 * 不排除 `.venv` 时 vulture 会扫依赖源码，甚至在大项目上爆栈（RecursionError → stdout 为空、exit=1，
 * 看起来像「没发现问题」，实际是崩溃）。排除后正常返回 3 + 真实 findings。
 */
const VULTURE_EXCLUDE = '.venv,venv,.git,node_modules,.tox,.pixi,.mypy_cache,.pytest_cache,.ruff_cache';

/** 各技术栈的死代码取证命令：python 用宿主定位到的 Python 绝对路径，不靠 PATH。 */
const DEADCODE_COMMANDS: Record<Stack, (target: string, tools: CheckerTools) => string> = {
  js: () => `knip --reporter json > .workflow/evidence/${EVIDENCE}`,
  python: (_target, tools) => `"${tools.python ?? 'python'}" -m vulture . --exclude ${VULTURE_EXCLUDE} > .workflow/evidence/${EVIDENCE}`,
};

/** 命令模板：默认 JS（knip 自己读 package.json / tsconfig，不需要目标参数）。 */
function buildCommand(_target: string): string {
  return DEADCODE_COMMANDS.js(_target, {});
}

/** knip 的可删项：导出 / 类型 / 依赖 / 开发依赖 / 未声明的依赖。 */
const UNUSED_KEYS = ['exports', 'types', 'dependencies', 'devDependencies', 'unlisted'] as const;

export const deadcodeChecker: Checker = {
  id: 'deadcode',
  name: '死代码扫描',
  evidence: EVIDENCE,
  defaultTarget: '',
  autoRun: true,
  buildCommands: DEADCODE_COMMANDS,
  normalizers: { python: normalizeVulture },
  buildCommand: buildCommand,
  check(evidence_json: unknown): CheckResult {
    if (evidence_json === null) return missingEvidence(EVIDENCE, buildCommand(''));
    const root = asRecord(evidence_json);
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
      // vulture 归一化：一条 message 一个 finding（file:line + 原文），不要拆成 files/exports 两条。
      const message = asString(record.message);
      if (message !== '') {
        const file = asString(record.file) || EVIDENCE;
        const line = asNumber(record.line);
        findings.push({ location: line > 0 ? `${file}:${line}` : file, problem: message });
        continue;
      }
      // knip 的形状（无 message 字段）：files / exports / ...
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
