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
export declare function parseChecklistLine(raw: string): {
    label: string;
    scope: string[];
};
/** 从会话手册里解析「实施顺序」小节的勾选清单；解析不到返回空数组。范围也一并解析。 */
export declare function parseChecklist(manual: string): ChecklistItem[];
/** 把清单所有条目声明的范围去重合并成一份（用于实现中越界拦截）。没有声明返回空数组。 */
export declare function collectChecklistScope(items: ChecklistItem[]): string[];
/** 判断「方案」小节是否已经写了实质内容（非标题、非注释、非空行）。 */
export declare function parseHasPlan(manual: string): boolean;
//# sourceMappingURL=manual-parse.d.ts.map