/** 去掉 `##` 前缀后的标题文字。 */
export declare function headingText(line: string): string;
/** 按 `## 标题` 切分手册，返回有序的 { 标题, 正文 } 列表。 */
export declare function splitManualSections(manual: string): Array<{
    title: string;
    body: string;
}>;
/** 去掉模板里的 HTML 注释行（占位说明不是内容：注入和追加条目时都不该带上它）。 */
export declare function stripHtmlComments(text: string): string;
/** 取第一个标题以这些前缀开头的小节正文；取不到返回空串。 */
export declare function pickSectionBody(manual: string, prefixes: string[]): string;
/** 从会话手册里解析「实施顺序」小节的勾选清单；解析不到返回空数组。证据只从 label 里剥掉，不返回。 */
export declare function parseChecklist(manual: string): Array<{
    label: string;
    done: boolean;
}>;
/** 判断「方案」小节是否已经写了实质内容（非标题、非注释、非空行）。 */
export declare function parseHasPlan(manual: string): boolean;
//# sourceMappingURL=manual-parse.d.ts.map