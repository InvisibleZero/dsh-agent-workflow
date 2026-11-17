/**
 * 会话手册「按层注入」的切片。
 *
 * 目标：不再把「方案」六小节全量注入，而是只注入
 *   1. 目标与验收（常驻，贯穿实现中）
 *   2. 当前层小节（第一个未勾的层）
 *   3. 已完成层的「层间契约」一句
 *
 * 纯函数，不碰 DOM/全局/文件。
 */
import { pickSectionBody } from './manual-parse';
/** 按 `### [N. ]标题` 把「方案」正文切成小节：序号可省，缺了按顺序补。 */
export function splitPlanSections(planBody) {
    const sections = [];
    let current = null;
    for (const line of planBody.split(/\r?\n/)) {
        const heading = /^###\s*(?:(\d+)\.\s*)?(.+?)\s*$/.exec(line);
        if (heading !== null) {
            if (current !== null)
                sections.push({ id: current.id, title: current.title, body: current.lines.join('\n').trim() });
            const title = heading[2] ?? '';
            current = { id: heading[1] === undefined ? sections.length + 1 : Number(heading[1]), title, lines: [] };
            continue;
        }
        if (current !== null)
            current.lines.push(line);
    }
    if (current !== null)
        sections.push({ id: current.id, title: current.title, body: current.lines.join('\n').trim() });
    return sections;
}
/** 从层小节正文抽出「层间契约」那句的正文（不含「层间契约：」前缀）；没有给空串。 */
export function extractContract(body) {
    for (const line of body.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('层间契约'))
            continue;
        const cut = trimmed.indexOf('：');
        return cut === -1 ? trimmed : trimmed.slice(cut + 1).trim();
    }
    return '';
}
/** 按清单 label 找对应层小节：label 形如「数据层 —— 完成标准：…」，标题是「数据层」。 */
function sectionForLabel(sections, label) {
    return sections.find((section) => label.includes(section.title));
}
/** 当前层：第一个未勾条目的对应小节；全部勾完给 undefined。 */
export function pickCurrentLayer(sections, items) {
    const unchecked = items.find((item) => !item.done);
    return unchecked === undefined ? undefined : sectionForLabel(sections, unchecked.label);
}
/** 已完成层的层间契约累积：只收 done 且写有「层间契约」的小节。 */
export function accumulateContracts(sections, items) {
    const contracts = [];
    for (const item of items) {
        if (!item.done)
            continue;
        const section = sectionForLabel(sections, item.label);
        if (section === undefined)
            continue;
        const contract = extractContract(section.body);
        if (contract !== '')
            contracts.push({ label: section.title, contract });
    }
    return contracts;
}
/**
 * 解析目标与验收的「总分」：总述一句 + 分项编号逐条。
 *
 * 认「【总】」当总述、「1、/ 2、/ …」当分项；既没编号也没【总】的行并入总述（兜底老格式）。
 */
export function parseSummary(goalBody) {
    const items = [];
    let summary = '';
    for (const raw of goalBody.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '' || line === '【分】')
            continue;
        const item = /^\d+[、.．]\s*(.+)$/.exec(line);
        if (item !== null) {
            items.push((item[1] ?? '').trim());
            continue;
        }
        const total = /^【总】\s*(.*)$/.exec(line);
        if (total !== null) {
            summary = (total[1] ?? '').trim();
            continue;
        }
        summary = summary === '' ? line : `${summary} ${line}`;
    }
    return { summary, items };
}
/**
 * 按层注入切片：目标常驻 + 当前层（第一个未勾）+ 已完成层契约。
 * pickCurrentLayer / accumulateContracts 的组合入口；目标总分解析另见 parseSummary。
 */
export function pickPerLayerPlan(planBody, items) {
    const sections = splitPlanSections(planBody);
    // 方案没分节（裸文本 / 老格式）：没法切片，整段当「目标」注入，不丢内容。
    if (sections.length === 0) {
        return { goal: planBody.trim(), currentTitle: '', currentBody: '', contracts: [] };
    }
    const goal = sections.find((section) => section.title.includes('目标')) ?? sections[0];
    const current = pickCurrentLayer(sections, items);
    const contracts = accumulateContracts(sections, items);
    return {
        goal: goal?.body ?? '',
        currentTitle: current?.title ?? '',
        currentBody: current?.body ?? '',
        contracts,
    };
}
/** 拼成注入用的「方案」文本。 */
export function composePerLayerPlan(plan) {
    const parts = [];
    if (plan.goal !== '')
        parts.push(`### 1. 目标与验收\n${plan.goal}`);
    if (plan.currentTitle !== '')
        parts.push(`### 当前层：${plan.currentTitle}\n${plan.currentBody}`);
    if (plan.contracts.length > 0) {
        parts.push(`已完成层契约：\n${plan.contracts.map((item) => `- ${item.label}：${item.contract}`).join('\n')}`);
    }
    return parts.join('\n\n');
}
/** 直接从整本手册里取「按层注入」后的方案文本（便捷入口，接 pickSessionManualParts）。 */
export function pickPerLayerPlanFromManual(manual, items) {
    return composePerLayerPlan(pickPerLayerPlan(pickSectionBody(manual, ['方案']), items));
}
//# sourceMappingURL=session-manual-slices.js.map