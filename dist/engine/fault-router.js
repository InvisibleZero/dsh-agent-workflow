/**
 * 故障路由：
 * - 系统异常且可重试 → retry（重试）
 * - 其余（不可重试的系统异常 / AI 语义异常）→ human_in_the_loop（交人工，标 blocked）
 */
export function routeFault(fault) {
    if (fault.kind === 'system' && fault.retryable)
        return 'retry';
    return 'human_in_the_loop';
}
//# sourceMappingURL=fault-router.js.map