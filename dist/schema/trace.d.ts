import { z } from 'zod';
/** 全链路跟踪日志。 */
export declare const TraceLog: z.ZodObject<{
    trace_id: z.ZodString;
    node_id: z.ZodString;
    action: z.ZodString;
    latency_ms: z.ZodNumber;
    token_usage: z.ZodObject<{
        input_tokens: z.ZodNumber;
        output_tokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        input_tokens: number;
        output_tokens: number;
    }, {
        input_tokens: number;
        output_tokens: number;
    }>;
    state_from: z.ZodEnum<["not_started", "discussing", "implementing", "verifying", "completed"]>;
    state_to: z.ZodEnum<["not_started", "discussing", "implementing", "verifying", "completed"]>;
    fault: z.ZodOptional<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
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
    }>]>>;
}, "strip", z.ZodTypeAny, {
    node_id: string;
    trace_id: string;
    action: string;
    latency_ms: number;
    token_usage: {
        input_tokens: number;
        output_tokens: number;
    };
    state_from: "not_started" | "discussing" | "implementing" | "verifying" | "completed";
    state_to: "not_started" | "discussing" | "implementing" | "verifying" | "completed";
    fault?: {
        message: string;
        kind: "system";
        retryable: boolean;
    } | {
        message: string;
        kind: "ai_semantic";
        retryable: false;
    } | undefined;
}, {
    node_id: string;
    trace_id: string;
    action: string;
    latency_ms: number;
    token_usage: {
        input_tokens: number;
        output_tokens: number;
    };
    state_from: "not_started" | "discussing" | "implementing" | "verifying" | "completed";
    state_to: "not_started" | "discussing" | "implementing" | "verifying" | "completed";
    fault?: {
        message: string;
        kind: "system";
        retryable: boolean;
    } | {
        message: string;
        kind: "ai_semantic";
        retryable: false;
    } | undefined;
}>;
export type TraceLog = z.infer<typeof TraceLog>;
//# sourceMappingURL=trace.d.ts.map