/**
 * 会话手册「方案」五小节的只读解析：设置页「附表」按打开那一刻的模板现算。
 *
 * 清单不在客户端写死——模板（host 的 SESSION_MANUAL_TEMPLATE）是唯一真源，
 * 这里只做「一段 markdown → 五个小节」的纯变换：不读盘、不碰 DOM、不抛错。
 */
/** 一处方案小节：序号、标题、模板注释里的提示。只有本模块用，不导出。 */
interface PlanSection {
    id: number;
    title: string;
    /** 模板里该节 `<!-- -->` 注释的正文；该节没写注释就是空串。 */
    hint: string;
}
/**
 * 解析模板里的 `### N. 标题` 与紧随的 `<!-- 提示 -->`。
 *
 * 凑不齐 1..5 五节就返回空数组：调用方（路由）据此回退成整段模板原文，
 * 不能因为标题写法被改了就显示成「五项是空的」。
 */
export declare function plan_sections_from_template(template: string): PlanSection[];
export {};
//# sourceMappingURL=plan-sections.d.ts.map