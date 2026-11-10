import { z } from 'zod';
/**
 * 故障二分类：
 * - system：网络超时、空指针等系统异常，可重试。
 * - ai_semantic：JSON 崩坏、大模型幻觉等语义异常，不可重试，交人工。
 */
export declare const WorkflowFault: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"system">;
    message: z.ZodString;
    retryable: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    message: string;
    kind: "system";
    retryable: boolean;
}, {
    message: string;
    kind: "system";
    retryable: boolean;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"ai_semantic">;
    message: z.ZodString;
    retryable: z.ZodLiteral<false>;
}, "strip", z.ZodTypeAny, {
    message: string;
    kind: "ai_semantic";
    retryable: false;
}, {
    message: string;
    kind: "ai_semantic";
    retryable: false;
}>]>;
export type WorkflowFault = z.infer<typeof WorkflowFault>;
//# sourceMappingURL=fault.d.ts.map