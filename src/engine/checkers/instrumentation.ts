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
  check(evidence_json: unknown): CheckResult {
    return validateInstrumentation(evidence_json);
  },
};
