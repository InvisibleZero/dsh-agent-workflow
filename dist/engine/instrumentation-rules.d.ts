/**
 * 埋点计划的结构规则（领域层，纯函数）。
 *
 * 两条规则：
 *   - validateInstrumentation：把一份 tree + 节点 KV 判成 ok / findings。只判结构，
 *     不判「排查路径全不全、字段够不够」——那是 AI 的判断（协助型分工）。
 *   - diffNodes：拿扫描到的已有埋点和计划里的节点比，分出「回填即可」与「需要新埋」。
 *
 * 不碰 DOM、不读写全局、不碰文件：证据 JSON 由接口层读进来再喂这里。
 */
import type { CheckResult } from './checkers/types';
import { type ExistingInstrumentation, type InstrumentationPlan } from '../schema/instrumentation';
/** 结构上限：深 / 每节点子节点 / 单棵总节点 / 节点 KV 总条数。默认值，可整体传入覆盖。 */
export interface InstrumentationLimits {
    maxDepth: number;
    maxChildren: number;
    maxTreeNodes: number;
    maxKvNodes: number;
}
export declare const INSTRUMENTATION_LIMITS: InstrumentationLimits;
/** 回填对比结果：planned 是全量 key，alreadyPresent 是已有埋点可回填的，toInsert 要新埋。 */
export interface InstrumentationDiff {
    planned: string[];
    alreadyPresent: string[];
    toInsert: string[];
}
/**
 * 判一份埋点计划。
 *
 * 检查项（全部确定性，对应方案里的结构校验）：
 *   1. 根 id 必须是 none；根不带埋点；bug 标签（根的直接子节点）不带埋点。
 *   2. 深度 ≤ maxDepth、每节点子节点 ≤ maxChildren、单棵总节点 ≤ maxTreeNodes。
 *   3. 路径节点（深度 ≥ 2）必须带埋点信息。
 *   4. 节点 KV 条数 ≤ maxKvNodes。
 *   5. 去重：树里同一 key（函数名+事件名）只能出现一次。
 *   6. KV 与树：树的每个埋点必须能在 KV 里找到且一致；KV 里的 path 节点必须挂在树上
 *      （field 白盒节点允许只在 KV）。
 *   7. 版本一致：所有节点 tree_version == 计划 tree_version。
 */
export declare function validateInstrumentation(raw: unknown, limits?: InstrumentationLimits): CheckResult;
/**
 * 回填对比：已有埋点（扫描产物）vs 计划节点。
 *
 * 扫描靠 grep，只能稳定拿到事件名（logEvent message 的稳定前缀）与位置，拿不到所在函数名，
 * 所以这里按「事件名」匹配——这是 grep 方案的已知精度损失（方案里「已知可优化」一节记过）。
 * 同一事件名在别处埋过，就当作已存在、回填即可，不重复埋。
 */
export declare function diffNodes(existing: ExistingInstrumentation[], plan: InstrumentationPlan): InstrumentationDiff;
//# sourceMappingURL=instrumentation-rules.d.ts.map