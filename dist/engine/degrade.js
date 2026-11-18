/**
 * 判断检查器在给定栈能否机器取证：
 *   - script 型（naming / instrumentation / build）目前只有 JS 脚本 → 仅 js 栈可验；
 *   - buildCommands 型（contract / deps / deadcode / boundary）→ 对应栈命中才可验；
 *   - 仅 buildCommand 型（regression 的 autocannon）→ 语言无关，有命令即可验。
 * 返回 false = 该栈没有机器驱动。
 */
export function hasMachineDriver(checker, stack) {
    if (checker.script !== undefined)
        return stack === 'js';
    if (checker.buildCommands !== undefined) {
        return stack !== null && typeof checker.buildCommands[stack] === 'function';
    }
    return typeof checker.buildCommand === 'function';
}
//# sourceMappingURL=degrade.js.map