/**
 * 检查器的契约：纯函数、不读盘、不碰 DOM。
 *
 * 检查器只做一件事：拿一份已经解析好的证据 JSON，判断合格不合格，把不合格项列出来。
 * 跑命令、读文件、传参、审计都在接口层（invokeChecker），这一层可以脱离文件系统单测。
 *
 * 证据文件是接口层「先跑命令、再读产物」的中间物：autoRun 的检查器会先执行插件自带的
 * 工具（vitest / depcruise / knip）生成证据，再读它判定。检查器本身不碰文件系统、
 * 不碰项目源码，只判接口层喂进来的 JSON。
 */
/** 缺产物时的统一结果：告诉调用方缺哪个文件、用什么命令生成。 */
export function missingEvidence(evidence, command) {
    return {
        ok: false,
        findings: [{ location: evidence, problem: `缺证据文件：先跑 \`${command}\` 生成 .workflow/evidence/${evidence}` }],
        stats: {},
    };
}
/** 从任意 JSON 里安全取对象；不是对象就当空对象。 */
export function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
}
/** 从任意 JSON 里安全取数组。 */
export function asArray(value) {
    return Array.isArray(value) ? value : [];
}
/** 安全取数字，取不到给 0。 */
export function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
/** 安全取字符串。 */
export function asString(value) {
    return typeof value === 'string' ? value : '';
}
//# sourceMappingURL=types.js.map