"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowFault = void 0;
const zod_1 = require("zod");
/**
 * 故障二分类：
 * - system：网络超时、空指针等系统异常，可重试。
 * - ai_semantic：JSON 崩坏、大模型幻觉等语义异常，不可重试，交人工。
 */
exports.WorkflowFault = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({
        kind: zod_1.z.literal('system'),
        message: zod_1.z.string(),
        retryable: zod_1.z.boolean(),
    }),
    zod_1.z.object({
        kind: zod_1.z.literal('ai_semantic'),
        message: zod_1.z.string(),
        retryable: zod_1.z.literal(false),
    }),
]);
//# sourceMappingURL=fault.js.map