import { z } from 'zod';
/**
 * 故障二分类：
 * - system：网络超时、空指针等系统异常，可重试。
 * - ai_semantic：JSON 崩坏、大模型幻觉等语义异常，不可重试，交人工。
 */
export const WorkflowFault = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('system'),
        message: z.string(),
        retryable: z.boolean(),
    }),
    z.object({
        kind: z.literal('ai_semantic'),
        message: z.string(),
        retryable: z.literal(false),
    }),
]);
//# sourceMappingURL=fault.js.map