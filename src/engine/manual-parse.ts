/**
 * 手册文本的纯解析：切小节、读勾选清单、判断方案是否为空。
 *
 * 放 engine 而不是 host：全是字符串处理、没有 IO，接口层（注入）与数据层（写入校验）
 * 必须用同一份解析——各写一份，两处对同一条清单的判断迟早会不一样。
 */
import { CHECK_EVIDENCE_MARK, CHECK_SCOPE_MARK } from '../schema/manual-limits';

/** 去掉 `##` 前缀后的标题文字。 */
export function headingText(line: string): string {
  return line.replace(/^#+\s*/, '').trim();
}

/** 按 `## 标题` 切分手册，返回有序的 { 标题, 正文 } 列表。 */
export function splitManualSections(manual: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of manual.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (current !== null) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
      current = { title: headingText(line), lines: [] };
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) sections.push({ title: current.title, body: current.lines.join('\n').trim() });
  return sections;
}

/** 去掉模板里的 HTML 注释行（占位说明不是内容：注入和追加条目时都不该带上它）。 */
export function stripHtmlComments(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('<!--'))
    .join('\n')
    .trim();
}

/** 取第一个标题以这些前缀开头的小节正文；取不到返回空串。 */
export function pickSectionBody(manual: string, prefixes: string[]): string {
  return splitManualSections(manual)
    .find((section) => prefixes.some((prefix) => section.title.startsWith(prefix)))
    ?.body ?? '';
}

/** 一条实施清单：label 是匹配键（不含范围/证据标注），scope 是可选实施范围。 */
export interface ChecklistItem {
  label: string;
  done: boolean;
  /** 该步骤声明的实施范围（相对工作目录的目录/文件路径，可为空数组 = 未声明）。 */
  scope: string[];
}

/**
 * 从一条清单行的正文里剥掉「范围」与「证据」两类标注，返回干净 label + 范围数组。
 * 范围标注在证据之前（证据是勾选后追加在行尾的），但这里两种顺序都容。
 */
export function parseChecklistLine(raw: string): { label: string; scope: string[] } {
  let text = raw;
  let scope: string[] = [];
  const scopeCut = text.indexOf(CHECK_SCOPE_MARK);
  if (scopeCut !== -1) {
    const rest = text.slice(scopeCut + CHECK_SCOPE_MARK.length);
    const evidenceCut = rest.indexOf(CHECK_EVIDENCE_MARK);
    const scopeText = evidenceCut === -1 ? rest : rest.slice(0, evidenceCut);
    scope = scopeText
      .split(/[,，]/)
      .map((segment) => segment.trim())
      .filter((segment) => segment !== '');
    text = text.slice(0, scopeCut);
  }
  const evidenceCut = text.indexOf(CHECK_EVIDENCE_MARK);
  const label = (evidenceCut === -1 ? text : text.slice(0, evidenceCut)).trim();
  return { label, scope };
}

/** 从会话手册里解析「实施顺序」小节的勾选清单；解析不到返回空数组。范围也一并解析。 */
export function parseChecklist(manual: string): ChecklistItem[] {
  const lines = manual.split(/\r?\n/);
  let inSection = false;
  const items: ChecklistItem[] = [];
  for (const line of lines) {
    if (line.trim() === '## 实施顺序') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection) continue;
    const match = /^\s*-\s+\[([ xX])\]\s*(.+)$/.exec(line);
    if (match !== null) {
      const parsed = parseChecklistLine((match[2] ?? '').trim());
      items.push({ label: parsed.label, done: match[1] !== ' ', scope: parsed.scope });
    }
  }
  return items;
}

/** 把清单所有条目声明的范围去重合并成一份（用于实现中越界拦截）。没有声明返回空数组。 */
export function collectChecklistScope(items: ChecklistItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const path of item.scope) {
      const normalized = path.replace(/\\/g, '/');
      if (normalized !== '' && !seen.has(normalized)) seen.add(normalized);
    }
  }
  return [...seen];
}

/** 会话手册里「范围追加」小节名（实现中 extend_scope 写的，append-only）。 */
export const SCOPE_APPEND_SECTION = '范围追加';

/** 范围追加一行里「原因」的分隔标记：- src/repo ｜ 原因：xxx */
export const SCOPE_REASON_MARK = ' ｜ 原因：';

/** 从会话手册的「范围追加」小节解析出追加的路径（相对路径数组）。 */
export function parseScopeAppends(manual: string): string[] {
  const body = pickSectionBody(manual, [SCOPE_APPEND_SECTION]);
  if (body.trim() === '') return [];
  const paths: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const text = trimmed.slice(2).trim();
    if (text === '') continue;
    const cut = text.indexOf(SCOPE_REASON_MARK);
    const path = (cut === -1 ? text : text.slice(0, cut)).trim().replace(/\\/g, '/');
    if (path !== '') paths.push(path);
  }
  return paths;
}

/** 判断「方案」小节是否已经写了实质内容（非标题、非注释、非空行）。 */
export function parseHasPlan(manual: string): boolean {
  const lines = manual.split(/\r?\n/);
  let inPlan = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## 方案')) {
      inPlan = true;
      continue;
    }
    if (inPlan && trimmed.startsWith('## ')) break;
    if (!inPlan) continue;
    if (trimmed === '' || trimmed.startsWith('### ') || trimmed.startsWith('<!--')) continue;
    return true;
  }
  return false;
}
