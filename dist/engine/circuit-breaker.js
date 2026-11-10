export class CircuitBreakerError extends Error {
    breaker;
    constructor(breaker, message) {
        super(message);
        this.breaker = breaker;
        this.name = 'CircuitBreakerError';
    }
}
/** 深度熔断：防止大模型幻觉导致无限嵌套套娃。 */
export function assertCanDescend(parent, childDepth) {
    if (childDepth >= parent.max_depth) {
        throw new CircuitBreakerError('max_depth', `超出最大嵌套深度 ${parent.max_depth}`);
    }
}
/** 步数熔断：防止状态机死循环。 */
export function assertCanStep(node) {
    if (node.step_count >= node.max_steps) {
        throw new CircuitBreakerError('max_steps', `超出最大步数 ${node.max_steps}`);
    }
}
//# sourceMappingURL=circuit-breaker.js.map