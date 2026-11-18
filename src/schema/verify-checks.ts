/**
 * 验收七项：固定条目（对应全局「七项体检」）。
 *
 * 只放常量与类型，**不引 zod**：客户端徽标要读条目名，客户端包里不能出现 zod
 * （client-bundle-purity 会拦）。
 *
 * 七项的顺序与名称是协议的一部分：报备按 id 落标记，不按文本匹配——
 * 文本是人写的，改一个字就再也勾不上（和手册「实施顺序」按文本匹配相反）。
 */

/** 检查器要求：哪项验收挂哪个检查器、是强制还是协助。 */
export interface CheckerRequirement {
  /** 检查器 id：contract / deps / deadcode / boundary / regression / instrumentation。 */
  id: string;
  /** required = 报 pass 前必须真跑过检查器并提交真实输出；assistive = 工具辅助、AI 判断为准、可不跑。 */
  enforcement: 'required' | 'assistive';
  /**
   * 协助型也能要求「本轮至少跑过一次」（报 pass 前）：只查有没有真调用记录，不卡 ok。
   * 埋点检测用它兜住「没扫就声称到位」——扫描是唯一确定性证据。默认 false。
   */
  require_run?: boolean;
}

/** 验收步骤默认允许改的东西：none=只读；docs=只写文档；source=允许改源码。 */
export type VerifyCheckModifies = 'none' | 'docs' | 'source';

export interface VerifyCheckDefinition {
  id: number;
  name: string;
  /** 测试类必须带复跑命令：不写命令的「跑过了」等于没说怎么验。 */
  needs_command: boolean;
  /** 一句话判据：注入给模型看，也当菜单提示。 */
  judge: string;
  /**
   * 验收中这一项默认允许改什么：none=只读；docs=只写文档；source=允许改源码。
   * 它只影响「默认口径」，不改变写门禁（门禁只在讨论中拦写）。
   */
  modifies: VerifyCheckModifies;
  /** 挂在这项上的检查器；没有 = 本轮无检查器（如第 5 项命名审查）。 */
  checker?: CheckerRequirement;
}

export const VERIFY_CHECKS: readonly VerifyCheckDefinition[] = [
  { id: 1, name: '契约测试', needs_command: true, modifies: 'source', judge: '对外行为与原实现一致或按新契约验证，要有可复现对照', checker: { id: 'contract', enforcement: 'required' } },
  { id: 2, name: '依赖检查', needs_command: false, modifies: 'source', judge: '无反向依赖、无循环依赖、无跨层引用', checker: { id: 'deps', enforcement: 'required' } },
  { id: 3, name: '死代码扫描', needs_command: false, modifies: 'source', judge: '无用导出 / 参数 / 字段，且要证明确实可删（引用计数为零）', checker: { id: 'deadcode', enforcement: 'required' } },
  { id: 4, name: '边界测试', needs_command: true, modifies: 'source', judge: '外部依赖可 mock，模块能独立测试', checker: { id: 'boundary', enforcement: 'required' } },
  { id: 5, name: '命名与边界审查', needs_command: false, modifies: 'none', judge: '泛化词、跨模块暴露、反向冗长、前缀越界四项', checker: { id: 'naming', enforcement: 'assistive', require_run: true } },
  { id: 6, name: '埋点检测', needs_command: false, modifies: 'source', judge: '黑盒逐跳三问 + 白盒五字段，三类结论：断点 / 无效埋点 / 质量盲区', checker: { id: 'instrumentation', enforcement: 'assistive', require_run: true } },
  { id: 7, name: '回归与压测', needs_command: true, modifies: 'source', judge: '跑现有测试套件，给 pass / fail + 证据（耗时、错误率、埋点抽样）', checker: { id: 'regression', enforcement: 'required' } },
  { id: 8, name: '收尾', needs_command: false, modifies: 'docs', judge: '把新决策 / 新坑 / 文档一致性写进项目手册，然后推进到已完结（自动，不再要人同意）' },
];

/** 条目状态：○ 待处理 / ✓ 通过 / ？ 问询（查出问题但本轮不修）。 */
export type VerifyMark = 'pending' | 'pass' | 'deferred';

/** 证据锚点：工作目录内的相对路径 + 可选行号。程序只校验它存在，不校验内容。 */
export interface VerifyAnchor {
  file: string;
  line?: number;
}

/** 问询项的发现：位置 / 问题 / 为什么不修 / 影响什么。四条都是文字，只校验非空。 */
export interface VerifyFinding {
  location: string;
  problem: string;
  why_not_fixed: string;
  impact: string;
}

/** 检查器结果：有检查器的验收项报备时带上，第一层门禁靠它判「跑没跑成、证据空没空」。 */
export interface CheckerResult {
  /** 检查器 id：contract / deps / deadcode / boundary / regression。 */
  checker_id: string;
  /** 检查器判定：true = 跑成且证据非空（0 用例算 false）。 */
  ok: boolean;
  /** 不合格条数。 */
  findings: number;
  /** 命令退出码；没有执行命令（只读现成产物）时为 null。 */
  exit_code: number | null;
}

export interface VerifyReport {
  /** 报备所属验收轮次：轮次不匹配的报备自动失效（重进验收要重报）。 */
  round: number;
  result: 'pass' | 'deferred';
  summary: string;
  anchors: VerifyAnchor[];
  command?: string;
  findings?: VerifyFinding[];
  /** 检查器结果：第一层门禁读它，第二层门禁（兜底）靠它区分「跑失败」。 */
  checker?: CheckerResult;
  /** 服务端时间戳，客户端不传。 */
  at: string;
}

export interface VerifyItem {
  id: number;
  mark: VerifyMark;
  report: VerifyReport | null;
}

/** 一次真实检查器调用的落盘记录：门禁靠它核对「真跑没跑、结果对不对」，重启也不丢。 */
export interface CheckerRun {
  checker_id: string;
  ok: boolean;
  exit_code: number | null;
  findings: number;
  /** 检查器生成/读取的证据文件（工作目录内相对路径）：报备锚点必须指着它。 */
  evidence?: string;
  at: string;
}

export interface VerificationState {
  /** 第几次进「验收中」：每进一次 +1，旧报备凭轮次失效。 */
  round: number;
  items: VerifyItem[];
  /** 本轮跑过的检查器（随轮次一起重置）；报 pass 的门禁读它。 */
  checker_runs: CheckerRun[];
}

/** 标记的显示符号：徽标、菜单、注入文本共用一套，避免三处各写一份。 */
export function verifyMarkSymbol(mark: VerifyMark): string {
  if (mark === 'pass') return '✓';
  if (mark === 'deferred') return '？';
  return '○';
}

/** 按当前轮次造一份全空清单（七项固定顺序）。 */
export function createVerification(round: number): VerificationState {
  return {
    round,
    items: VERIFY_CHECKS.map((check) => ({ id: check.id, mark: 'pending' as VerifyMark, report: null })),
    checker_runs: [],
  };
}
