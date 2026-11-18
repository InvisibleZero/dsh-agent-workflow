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

/**
 * 没写计划时返回的格式引导。
 * 工具目录只渲染描述第一句（≤90 字），完整格式放不进目录，所以放在「没计划」的说明里带回去——
 * 模型跑一次 check_instrumentation 就能拿到格式，不用猜。
 */
const PLAN_FORMAT_HINT = '{"tree_version":1,"root":{"id":"none","label":"none","children":[{"id":"bug-1","label":"现象","children":[{"id":"p-1","label":"环节","instrument":{"function":"函数名","event":"事件名","tree_version":1,"kind":"path"},"children":[]}]}]},"nodes":{"函数名::事件名":{"function":"函数名","event":"事件名","tree_version":1,"kind":"path"}}}。规则：根 id 固定 none 且不带埋点；根的直接子节点是 bug 标签、不带埋点；深度≥2 的路径节点必须带 instrument；树上的每个 instrument 要在 nodes 里有同 key 且一致；深度≤4、每节点子≤5、树≤50 节点、KV≤200。';

export const instrumentationChecker: Checker = {
  id: 'instrumentation',
  name: '埋点检测',
  evidence: EVIDENCE,
  // 埋点树是项目资产（跟项目走、可提交、可 review），放项目根而不是 .workflow/evidence/。
  evidenceAtProjectRoot: true,
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
    const result = validateInstrumentation(evidence_json);
    // 没有计划：把「草稿 + 格式 + 规则 + 插入语义」一起带回去，模型不用从零手写整棵树。
    if (result.stats.config_missing === 1) {
      return {
        ...result,
        note: `${result.note ?? ''}　工具已按代码里的函数生成草稿（项目根的 instrumentation-skeleton.json）：改 label / event 整理成排查路径，存成**项目根的 instrumentation.json**（跟仓库走、可提交）再跑。工具会按计划把缺失埋点插进源码（没埋点的项目靠这一步建树，属正常交付）；已有同事件会跳过、不重复插。格式：${PLAN_FORMAT_HINT}`,
      };
    }
    return result;
  },
};
