/**
 * 项目手册的「标签」：条目行格式 `- [标签1｜标签2] 正文`，标签由「## 标签表」统一登记。
 *
 * 为什么要有标签：项目手册的三节不进系统提示，模型靠 `grep` 去查。
 * grep 是按行匹配的，条目行首没有可被猜到的词，就等于查不到。
 *
 * 全是纯函数：解析、归一化、渲染、级联改名。读写盘在仓储层。
 */
/** 标签表汇总的小节名（也是 `## 标签表` 的标题前缀）。 */
export declare const TAG_TABLE_SECTION = "\u6807\u7B7E\u8868";
/** 标签表最多几条：到了就拒新增，逼模型用合并通道，不然注入层会被撑爆。 */
export declare const TAG_TABLE_MAX = 30;
/**
 * 归一化一个标签：全角转半角、去所有空白、英文小写。
 * 非法（空、超长、含方括号或分隔符）返回 null，由调用方拒写。
 */
export declare function normalizeTag(raw: unknown): string | null;
/** 去重（保序）。 */
export declare function dedupeTags(tags: string[]): string[];
/** 解析「## 标签表」小节正文：一行一个标签，`- ` 前缀可写可不写。 */
export declare function parseTagTable(sectionBody: string): string[];
/** 渲染标签表小节正文：一行一个 `- 标签`，空表返回空串（不写占位行，否则会被当成标签）。 */
export declare function renderTagTable(tags: string[]): string;
/** 解析一条条目行；不是 `- [..] 正文` 形态（例如历史条目）返回 null。 */
export declare function parseEntryLine(line: string): {
    tags: string[];
    text: string;
} | null;
/** 渲染一条条目行。 */
export declare function renderEntryLine(tags: string[], text: string): string;
/**
 * 把一条条目行里的 from 标签换成 to；其他标签保序，重复的合并。
 * 不是条目行、或本来就不含 from，原样返回。
 */
export declare function rewriteEntryTag(line: string, from: string, to: string): string;
/**
 * 找条目：按「正文」精确匹配（历史无标签条目按整行去 `- ` 后的文字匹配）。
 * @returns 命中行的下标数组（不是行内容）；多于一条时由调用方报错——猜错一条比报错更糟。
 */
export declare function findEntryLineIndexes(body: string, entry: string): number[];
//# sourceMappingURL=manual-tags.d.ts.map