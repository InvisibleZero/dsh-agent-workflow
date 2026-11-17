import type { InstrumentationPlan } from '../schema/instrumentation';
/**
 * 读埋点计划：文件不存在返回 null（还没建树），JSON 坏掉抛错（证据坏了要显式报，不能当成没建）。
 */
export declare function loadInstrumentationJson(workingDirectory: string): Promise<InstrumentationPlan | null>;
/** 写埋点计划：目录不存在先建，再整份覆盖（树重建就是覆盖，不做增量合并）。 */
export declare function saveInstrumentationJson(workingDirectory: string, plan: InstrumentationPlan): Promise<void>;
//# sourceMappingURL=instrumentation-store.d.ts.map