import type { ContextSummaryPort } from './port';

/** 朴素摘要：把任意 payload 序列化后按长度截断。仅作默认实现，可替换。 */
export class NaiveContextSummarizer implements ContextSummaryPort {
  summarize(payload: unknown, maxLength = 2000): string {
    if (payload === null || payload === undefined) return '';
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
  }
}
