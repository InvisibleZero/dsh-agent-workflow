/**
 * 检查器注册表：工具定义里的 `run.checker` 只能取这里的 id。
 *
 * 加新检查器的顺序：写实现 → 在这里登记 → 用 workflow_tool_add 把工具定义写进
 * `tools/tool-registry.json` → 提交。三步缺一，工具要么找不到实现、要么不出现在目录里。
 *
 * 第 5 项（命名与边界审查）与第 6 项（埋点检测）暂不做检查器，保留原验收方式。
 */
import { boundaryChecker } from './boundary';
import { contractChecker } from './contract';
import { deadcodeChecker } from './deadcode';
import { depsChecker } from './deps';
import { regressionChecker } from './regression';
export const CHECKERS = [
    contractChecker,
    depsChecker,
    deadcodeChecker,
    boundaryChecker,
    regressionChecker,
];
export const CHECKER_IDS = CHECKERS.map((checker) => checker.id);
export function findChecker(id) {
    return CHECKERS.find((checker) => checker.id === id);
}
//# sourceMappingURL=index.js.map