import { describe, it, expect } from 'vitest';
import { NaiveContextSummarizer } from '../src/adapter/context-summary';

describe('NaiveContextSummarizer', () => {
  const summarizer = new NaiveContextSummarizer();

  it('null / undefined → 空串', () => {
    expect(summarizer.summarize(null)).toBe('');
    expect(summarizer.summarize(undefined)).toBe('');
  });

  it('短内容原样返回', () => {
    expect(summarizer.summarize('短文本')).toBe('短文本');
    expect(summarizer.summarize({ a: 1 })).toBe('{"a":1}');
  });

  it('超长内容按长度截断', () => {
    const long = 'x'.repeat(100);
    const out = summarizer.summarize(long, 10);
    expect(out).toHaveLength(11); // 10 字符 + 省略号
    expect(out.endsWith('…')).toBe(true);
  });
});
