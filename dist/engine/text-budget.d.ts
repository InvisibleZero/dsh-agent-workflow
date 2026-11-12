/**
 * UTF-8 字节数。
 *
 * 不用 Buffer.byteLength：引擎模块会被客户端侧一并引用，Buffer 在浏览器里不存在。
 */
export declare function countUtf8Bytes(text: string): number;
/**
 * 按字节裁剪。
 *
 * 之前是「按字节判断、按字符切」：中文一个字 3 字节，字节超了 8000、字符没超 8000 时
 * 内容一个字都没切却照样追加「（已截断）」，等于骗模型；真到 8000 字符时又切出 24KB。
 */
export declare function truncateToBytes(text: string, maxBytes: number): string;
//# sourceMappingURL=text-budget.d.ts.map