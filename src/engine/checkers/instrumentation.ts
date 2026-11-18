/**
 * 第 6 项：埋点检测（协助型）。
 *
 * 和另外 5 个检查器不同：它的证据不是工具跑出来的测试 / 扫描产物，而是 AI 建的
 * 「埋点计划」（tree + 节点 KV，见 schema/instrumentation）。本检查器做两件事：
 *   1. autoRun 跑插件自带脚本 instrument-apply.mjs：扫已有埋点、按树节点锚点补插、重扫；
 *   2. 读 instrumentation.json，用 validateInstrumentation 判结构。
 *
 * 判定只到「结构合格」；埋点全不全、字段够不够由 AI 判（所以这项是 assistive）。
 */
import { validateInstrumentation } from '../instrumentation-rules';
import type { CheckResult, Checker } from './types';

const EVIDENCE = 'instrumentation.json';

export const instrumentationChecker: Checker = {
  id: 'instrumentation',
  name: '埋点检测',
  evidence: EVIDENCE,
  defaultTarget: '',
  autoRun: true,
  script: 'instrument-apply.mjs',
  check(evidence_json: unknown, context?: { stack?: string | null }): CheckResult {
    const stack = context?.stack;
    // 埋点检测只认 js / python（脚本按这两种语言的调用形态扫与插）；别的栈明确报「不支持」，
    // 不要让它表现为「没配计划」或「不合格」——那不是同一回事。
    if (typeof stack === 'string' && stack !== '' && stack !== 'js' && stack !== 'python') {
      return {
        ok: false,
        findings: [],
        stats: {},
        unsupported: `埋点检测只支持 js / python，当前栈是 ${stack}`,
      };
    }
    return validateInstrumentation(evidence_json);
  },
};
