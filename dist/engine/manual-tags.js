/**
 * 项目手册的「标签」：条目行格式 `- [标签1｜标签2] 正文`，标签由「## 标签表」统一登记。
 *
 * 为什么要有标签：项目手册的三节不进系统提示，模型靠 `grep` 去查。
 * grep 是按行匹配的，条目行首没有可被猜到的词，就等于查不到。
 *
 * 全是纯函数：解析、归一化、渲染、级联改名。读写盘在仓储层。
 */
/** 标签表汇总的小节名（也是 `## 标签表` 的标题前缀）。 */
export const TAG_TABLE_SECTION = '标签表';
/** 标签表最多几条：到了就拒新增，逼模型用合并通道，不然注入层会被撑爆。 */
export const TAG_TABLE_MAX = 30;
/** 单个标签最多几个字（字符数，不是字节）。 */
const TAG_MAX_CHARS = 12;
/** 一条里的多个标签用什么分隔（全角竖线，避免和 markdown 冲突）。 */
const TAG_SEPARATOR = '｜';
/** 条目行：`- [标签1｜标签2] 正文`。 */
const ENTRY_PATTERN = /^(\s*-\s+)\[([^\]]*)\]\s*(.*)$/;
/**
 * 归一化一个标签：全角转半角、去所有空白、英文小写。
 * 非法（空、超长、含方括号或分隔符）返回 null，由调用方拒写。
 */
export function normalizeTag(raw) {
    if (typeof raw !== 'string')
        return null;
    // NFKC 把全角字母数字、全角竖线统一成半角，避免「门禁」和「门禁」看起来一样其实不是同一个串。
    const folded = raw.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    if (folded === '')
        return null;
    if (/[[\]｜|]/.test(folded))
        return null;
    if (Array.from(folded).length > TAG_MAX_CHARS)
        return null;
    return folded;
}
/** 去重（保序）。 */
export function dedupeTags(tags) {
    const seen = new Set();
    const result = [];
    for (const tag of tags) {
        if (seen.has(tag))
            continue;
        seen.add(tag);
        result.push(tag);
    }
    return result;
}
/** 解析「## 标签表」小节正文：一行一个标签，`- ` 前缀可写可不写。 */
export function parseTagTable(sectionBody) {
    const tags = [];
    for (const raw of sectionBody.split(/\r?\n/)) {
        const line = raw.trim().replace(/^-\s*/, '');
        if (line === '')
            continue;
        const normalized = normalizeTag(line);
        if (normalized !== null)
            tags.push(normalized);
    }
    return dedupeTags(tags);
}
/** 渲染标签表小节正文：一行一个 `- 标签`，空表返回空串（不写占位行，否则会被当成标签）。 */
export function renderTagTable(tags) {
    return dedupeTags(tags).map((tag) => `- ${tag}`).join('\n');
}
/** 解析一条条目行；不是 `- [..] 正文` 形态（例如历史条目）返回 null。 */
export function parseEntryLine(line) {
    const matched = ENTRY_PATTERN.exec(line);
    if (matched === null)
        return null;
    const tags = dedupeTags((matched[2] ?? '')
        .split(new RegExp(`[${TAG_SEPARATOR}|]`))
        .map((tag) => normalizeTag(tag))
        .filter((tag) => tag !== null));
    return { tags, text: (matched[3] ?? '').trim() };
}
/** 渲染一条条目行。 */
export function renderEntryLine(tags, text) {
    return `- [${dedupeTags(tags).join(TAG_SEPARATOR)}] ${text.trim()}`;
}
/**
 * 把一条条目行里的 from 标签换成 to；其他标签保序，重复的合并。
 * 不是条目行、或本来就不含 from，原样返回。
 */
export function rewriteEntryTag(line, from, to) {
    const parsed = parseEntryLine(line);
    if (parsed === null)
        return line;
    if (!parsed.tags.includes(from))
        return line;
    const next = dedupeTags(parsed.tags.map((tag) => (tag === from ? to : tag)));
    return renderEntryLine(next, parsed.text);
}
/**
 * 找条目：按「正文」精确匹配（历史无标签条目按整行去 `- ` 后的文字匹配）。
 * @returns 命中行的下标数组（不是行内容）；多于一条时由调用方报错——猜错一条比报错更糟。
 */
export function findEntryLineIndexes(body, entry) {
    const target = entry.trim();
    const hits = [];
    body.split(/\r?\n/).forEach((line, index) => {
        const parsed = parseEntryLine(line);
        const text = parsed === null ? line.trim().replace(/^-\s*/, '') : parsed.text;
        if (text === target)
            hits.push(index);
    });
    return hits;
}
//# sourceMappingURL=manual-tags.js.map