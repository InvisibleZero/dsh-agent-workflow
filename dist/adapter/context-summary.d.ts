import type { ContextSummaryPort } from './port';
/** 朴素摘要：把任意 payload 序列化后按长度截断。仅作默认实现，可替换。 */
export declare class NaiveContextSummarizer implements ContextSummaryPort {
    summarize(payload: unknown, maxLength?: number): string;
}
//# sourceMappingURL=context-summary.d.ts.map