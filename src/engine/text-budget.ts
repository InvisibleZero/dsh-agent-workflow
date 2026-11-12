/**
 * UTF-8 字节数。
 *
 * 不用 Buffer.byteLength：引擎模块会被客户端侧一并引用，Buffer 在浏览器里不存在。
 */
export function countUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 按字节裁剪。
 *
 * 之前是「按字节判断、按字符切」：中文一个字 3 字节，字节超了 8000、字符没超 8000 时
 * 内容一个字都没切却照样追加「（已截断）」，等于骗模型；真到 8000 字符时又切出 24KB。
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return text;
  let end = maxBytes;
  // 回退到 UTF-8 字符边界：续字节形如 10xxxxxx。
  while (end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString('utf8')}…（已截断）`;
}
