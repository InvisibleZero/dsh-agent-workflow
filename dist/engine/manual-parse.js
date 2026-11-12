/**
 * 手册文本的纯解析：切小节、读勾选清单、判断方案是否为空。
 *
 * 放 engine 而不是 host：全是字符串处理、没有 IO，接口层（注入）与数据层（写入校验）
 * 必须用同一份解析——各写一份，两处对同一条清单的判断迟早会不一样。
 */
import { CHECK_EVIDENCE_MARK } from '../schema/manual-limits';
/** 去掉 `##` 前缀后的标题文字。 */
export function headingText(line) {
    return line.replace(/^#+\s*/, '').trim();
}
/** 按 `## 标题` 切分手册，返回有序的 { 标题, 正文 } 列表。 */
export function splitManualSections(manual) {
    const sections = [];
    let current = null;
    for (const line of manual.split(/\r?\n/)) {
        if (line.startsWith('## ')) {
            if (current !== null)
                sections.push({ title: current.title, body: current.lines.join('\n').trim() });
            current = { title: headingText(line), lines: [] };
            continue;
        }
        if (current !== null)
            current.lines.push(line);
    }
    if (current !== null)
        sections.push({ title: current.title, body: current.lines.join('\n').trim() });
    return sections;
}
/** 去掉模板里的 HTML 注释行（占位说明不是内容：注入和追加条目时都不该带上它）。 */
export function stripHtmlComments(text) {
    return text
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('<!--'))
        .join('\n')
        .trim();
}
/** 取第一个标题以这些前缀开头的小节正文；取不到返回空串。 */
export function pickSectionBody(manual, prefixes) {
    return splitManualSections(manual)
        .find((section) => prefixes.some((prefix) => section.title.startsWith(prefix)))
        ?.body ?? '';
}
/** 从会话手册里解析「实施顺序」小节的勾选清单；解析不到返回空数组。证据只从 label 里剥掉，不返回。 */
export function parseChecklist(manual) {
    const lines = manual.split(/\r?\n/);
    let inSection = false;
    const items = [];
    for (const line of lines) {
        if (line.trim() === '## 实施顺序') {
            inSection = true;
            continue;
        }
        if (inSection && line.startsWith('## '))
            break;
        if (!inSection)
            continue;
        const match = /^\s*-\s+\[([ xX])\]\s*(.+)$/.exec(line);
        if (match !== null) {
            const raw = (match[2] ?? '').trim();
            const cut = raw.indexOf(CHECK_EVIDENCE_MARK);
            items.push({ label: cut === -1 ? raw : raw.slice(0, cut).trim(), done: match[1] !== ' ' });
        }
    }
    return items;
}
/** 判断「方案」小节是否已经写了实质内容（非标题、非注释、非空行）。 */
export function parseHasPlan(manual) {
    const lines = manual.split(/\r?\n/);
    let inPlan = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('## 方案')) {
            inPlan = true;
            continue;
        }
        if (inPlan && trimmed.startsWith('## '))
            break;
        if (!inPlan)
            continue;
        if (trimmed === '' || trimmed.startsWith('### ') || trimmed.startsWith('<!--'))
            continue;
        return true;
    }
    return false;
}
//# sourceMappingURL=manual-parse.js.map