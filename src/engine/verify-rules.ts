/**
 * 验收七项的纯规则：解析条目、校验报备形状、汇总进度。
 *
 * 全是字符串/数组处理、不读盘：盘上的锚点校验在仓储（数据层），
 * 这里只判「报备本身是否说得清」——分层跟手册那套一致。
 */
import {
  VERIFY_CHECKS,
  createVerification,
  type VerificationState,
  type VerifyAnchor,
  type VerifyCheckDefinition,
  type VerifyFinding,
  type VerifyItem,
  type VerifyMark,
  type VerifyReport,
} from '../schema/verify-checks';

/** 报备里允许模型填写的那部分（round / at 由服务端补）。 */
export interface VerifyReportInput {
  result: 'pass' | 'deferred';
  summary: string;
  anchors: VerifyAnchor[];
  command?: string;
  findings?: VerifyFinding[];
}

/** 数字或名称 → 条目 id；两种都认不出时抛错，并把可选项列出来。 */
export function resolveVerifyCheckId(raw: unknown): number {
  const text = String(raw ?? '').trim();
  const asNumber = Number(text);
  if (Number.isInteger(asNumber)) {
    const found = VERIFY_CHECKS.find((check) => check.id === asNumber);
    if (found !== undefined) return found.id;
  }
  const byName = VERIFY_CHECKS.find((check) => check.name === text);
  if (byName !== undefined) return byName.id;
  throw new Error(
    `「${text}」不是验收项：用 id 1-7 或名称（${VERIFY_CHECKS.map((check) => `${check.id} ${check.name}`).join(' / ')}）`,
  );
}

/** 证据路径的形状限制：只允许工作目录内的相对路径，挡绝对路径与 ../。 */
export function assertAnchorPathShape(file: string): void {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.trim() === '') throw new Error('证据路径不能为空');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`证据路径必须是工作目录内的相对路径（不认绝对路径）：${file}`);
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error(`证据路径不能含 ..（不许跑出工作目录）：${file}`);
  }
}

/**
 * 校验报备的「说得清」部分，通过则返回规范化后的输入。
 *
 * 分档口径：这里只判字段齐不齐、格式对不对；文件在不在、行号越不越界由仓储判
 * （要读盘）。两处都过，才算一份可落标记的报备。
 */
export function validateVerifyReportInput(check: VerifyCheckDefinition, raw: any): VerifyReportInput {
  const result = raw?.result;
  if (result !== 'pass' && result !== 'deferred') {
    throw new Error('报备结论只能是 pass（通过）或 deferred（查出问题但本轮不修，记 ？）');
  }
  const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
  if (summary === '') throw new Error('报备要写结论摘要：做了什么、看到什么结果');

  const rawAnchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
  if (rawAnchors.length === 0) {
    throw new Error('报备至少要给一条证据锚点 anchors：[{ file, line? }]（文件必须在工作目录内）');
  }
  const anchors: VerifyAnchor[] = rawAnchors.map((anchor: any, index: number) => {
    const file = typeof anchor?.file === 'string' ? anchor.file.trim() : '';
    if (file === '') throw new Error(`第 ${index + 1} 条锚点缺 file`);
    assertAnchorPathShape(file);
    const line = anchor?.line;
    if (line !== undefined && line !== null) {
      if (!Number.isInteger(line) || line <= 0) throw new Error(`锚点行号必须是正整数：${file}:${String(line)}`);
      return { file, line };
    }
    return { file };
  });

  const command = typeof raw?.command === 'string' ? raw.command.trim() : '';
  if (check.needs_command && command === '') {
    throw new Error(`「${check.name}」必须写复跑命令 command（例：npx vitest run test/xxx.test.ts）`);
  }

  const findings: VerifyFinding[] = [];
  if (result === 'deferred') {
    const rawFindings = Array.isArray(raw?.findings) ? raw.findings : [];
    if (rawFindings.length === 0) {
      throw new Error('结论 deferred 必须带 findings：每条写清 位置 / 问题 / 为什么不修 / 影响什么');
    }
    rawFindings.forEach((finding: any, index: number) => {
      const fields: Array<keyof VerifyFinding> = ['location', 'problem', 'why_not_fixed', 'impact'];
      const parsed = {} as VerifyFinding;
      for (const field of fields) {
        const value = typeof finding?.[field] === 'string' ? finding[field].trim() : '';
        if (value === '') throw new Error(`第 ${index + 1} 条 findings 缺「${field}」`);
        parsed[field] = value;
      }
      findings.push(parsed);
    });
  }

  return {
    result,
    summary,
    anchors,
    ...(command === '' ? {} : { command }),
    ...(findings.length === 0 ? {} : { findings }),
  };
}

/**
 * 把快照里的未知值收成合法状态：缺字段 / 坏字段一律回落到七项全空。
 * 旧快照没有 verification 字段，走的就是这里——不做数据迁移。
 */
export function pickVerification(raw: unknown): VerificationState {
  if (raw === null || typeof raw !== 'object') return createVerification(0);
  const source = raw as { round?: unknown; items?: unknown };
  const round = typeof source.round === 'number' && Number.isInteger(source.round) && source.round >= 0
    ? source.round
    : 0;
  const incoming = Array.isArray(source.items) ? source.items : [];
  const items: VerifyItem[] = VERIFY_CHECKS.map((check) => {
    const found = incoming.find((item: any) => item?.id === check.id);
    if (found === undefined || found === null) return { id: check.id, mark: 'pending' as VerifyMark, report: null };
    const mark: VerifyMark = found.mark === 'pass' || found.mark === 'deferred' ? found.mark : 'pending';
    const report = mark !== 'pending' && found.report !== null && typeof found.report === 'object'
      ? (found.report as VerifyReport)
      : null;
    return { id: check.id, mark: report === null ? 'pending' : mark, report };
  });
  return { round, items };
}

export interface VerificationSummary {
  total: number;
  pass: number;
  deferred: number;
  pending: number;
  complete: boolean;
}

export function summarizeVerification(state: VerificationState): VerificationSummary {
  const pass = state.items.filter((item) => item.mark === 'pass').length;
  const deferred = state.items.filter((item) => item.mark === 'deferred').length;
  const pending = state.items.filter((item) => item.mark === 'pending').length;
  return {
    total: state.items.length,
    pass,
    deferred,
    pending,
    complete: pending === 0,
  };
}

/** 未处理项的展示文本：报错与注入共用，避免两处措辞各写一套。 */
export function describePendingItems(state: VerificationState): string {
  return state.items
    .filter((item) => item.mark === 'pending')
    .map((item) => `${item.id} ${VERIFY_CHECKS.find((check) => check.id === item.id)?.name ?? ''}`.trim())
    .join(' / ');
}
