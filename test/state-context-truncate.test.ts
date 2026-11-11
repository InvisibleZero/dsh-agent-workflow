import { describe, expect, it } from 'vitest';
import { truncateToBytes } from '../src/host/workflow-state-context';

/**
 * 注入块的字节截断。
 *
 * 历史 bug：按字节判断超限、却按字符切片。中文一个字 3 字节，于是
 * 「字节 9000、字符 3000」时一个字都没切，却照样追加「（已截断）」——骗模型；
 * 真到 8000 字符时又切出 24KB。这里把正确行为钉住。
 */
describe('注入块按字节截断', () => {
  it('未超限时原样返回，不加截断标记', () => {
    const text = '短文本，没有超限。';
    expect(truncateToBytes(text, 8000)).toBe(text);
  });

  it('超限时按字节切，且不切坏中文字符', () => {
    const text = '中'.repeat(3000); // 9000 字节
    const out = truncateToBytes(text, 8000);

    expect(out.endsWith('…（已截断）')).toBe(true);
    // 不含替换字符 = 没有把汉字从中间切开
    expect(out).not.toContain('\uFFFD');
    // 正文部分（去掉标记）不超过上限
    const body = out.replace('…（已截断）', '');
    expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(8000);
    // 也不能一点没切：原来的 3000 个字必须变少
    expect(body.length).toBeLessThan(3000);
  });

  it('刚好等于上限时不算超限', () => {
    const text = 'a'.repeat(8000);
    expect(truncateToBytes(text, 8000)).toBe(text);
  });
});
