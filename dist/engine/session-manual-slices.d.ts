/** 方案里的一节：序号、标题、正文。 */
export interface PlanSectionSlice {
    id: number;
    title: string;
    body: string;
}
/** 按 `### [N. ]标题` 把「方案」正文切成小节：序号可省，缺了按顺序补。 */
export declare function splitPlanSections(planBody: string): PlanSectionSlice[];
/** 从层小节正文抽出「层间契约」那句的正文（不含「层间契约：」前缀）；没有给空串。 */
export declare function extractContract(body: string): string;
/** 已完成层契约：一层一条。 */
export interface ContractLine {
    label: string;
    contract: string;
}
/** 按层切片结果。 */
export interface PerLayerPlan {
    /** 目标与验收正文。 */
    goal: string;
    /** 当前层标题（无未勾层时为空串）。 */
    currentTitle: string;
    /** 当前层正文。 */
    currentBody: string;
    /** 已完成层的层间契约。 */
    contracts: ContractLine[];
}
/** 清单条目的最小形状（label + done）。 */
export interface ChecklistLine {
    label: string;
    done: boolean;
}
/** 当前层：第一个未勾条目的对应小节；全部勾完给 undefined。 */
export declare function pickCurrentLayer(sections: PlanSectionSlice[], items: ChecklistLine[]): PlanSectionSlice | undefined;
/** 已完成层的层间契约累积：只收 done 且写有「层间契约」的小节。 */
export declare function accumulateContracts(sections: PlanSectionSlice[], items: ChecklistLine[]): ContractLine[];
/** 目标与验收的总分解析结果。 */
export interface SummaryPlan {
    /** 总述一句。 */
    summary: string;
    /** 分项（编号已去掉）。 */
    items: string[];
}
/**
 * 解析目标与验收的「总分」：总述一句 + 分项编号逐条。
 *
 * 认「【总】」当总述、「1、/ 2、/ …」当分项；既没编号也没【总】的行并入总述（兜底老格式）。
 */
export declare function parseSummary(goalBody: string): SummaryPlan;
/**
 * 按层注入切片：目标常驻 + 当前层（第一个未勾）+ 已完成层契约。
 * pickCurrentLayer / accumulateContracts 的组合入口；目标总分解析另见 parseSummary。
 */
export declare function pickPerLayerPlan(planBody: string, items: ChecklistLine[]): PerLayerPlan;
/** 拼成注入用的「方案」文本。 */
export declare function composePerLayerPlan(plan: PerLayerPlan): string;
/** 直接从整本手册里取「按层注入」后的方案文本（便捷入口，接 pickSessionManualParts）。 */
export declare function pickPerLayerPlanFromManual(manual: string, items: ChecklistLine[]): string;
//# sourceMappingURL=session-manual-slices.d.ts.map