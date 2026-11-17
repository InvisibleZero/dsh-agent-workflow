"use strict";
/**
 * 埋点计划的证据模型（第 6 项「埋点检测」专用）。
 *
 * 两个数据结构：
 *   - tree：黑盒排查路径树。根固定 none；根的子节点是 bug 标签（只当标题，本身不埋）；
 *           bug 之下递归「路径 = 埋点」节点，每个路径节点带函数名 / 事件名 / 树版本。
 *   - nodes：节点 KV，key = 函数名 + 事件名；黑盒路径节点与白盒字段节点都进这里去重。
 *
 * 只放类型与纯函数，不引 zod、不碰 node 内置模块（保持 schema 层惯例）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrumentationKey = instrumentationKey;
/** KV 的去重键：函数名 + 事件名。 */
function instrumentationKey(fn, event) {
    return `${fn}::${event}`;
}
//# sourceMappingURL=instrumentation.js.map