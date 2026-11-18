import type { Stack } from './checkers/stack';

/**
 * 检查器取证的降级判定（纯规则）：给定技术栈下，这个检查器有没有机器取证能力。
 *
 * 无机器驱动 = 降级为 AI 证据（AI 用命令工具自己跑、留证据、人验收）。
 * 只做判定、不读盘；上层（接口层）拿它决定要不要放行 required 门禁。
 */

export interface MachineVerifiable {
  script?: string;
  buildCommands?: Partial<Record<Stack, (target: string) => string>>;
  buildCommand?: (target: string) => string;
}

/**
 * 判断检查器在给定栈能否机器取证：
 *   - script 型（naming / instrumentation / build）目前只有 JS 脚本 → 仅 js 栈可验；
 *   - buildCommands 型（contract / deps / deadcode / boundary）→ 对应栈命中才可验；
 *   - 仅 buildCommand 型（regression 的 autocannon）→ 语言无关，有命令即可验。
 * 返回 false = 该栈没有机器驱动。
 */
export function hasMachineDriver(checker: MachineVerifiable, stack: Stack | null): boolean {
  if (checker.script !== undefined) return stack === 'js';
  if (checker.buildCommands !== undefined) {
    return stack !== null && typeof checker.buildCommands[stack] === 'function';
  }
  return typeof checker.buildCommand === 'function';
}
