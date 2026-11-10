import type { AgentNode } from '../schema/node';
export declare class CircuitBreakerError extends Error {
    readonly breaker: 'max_depth' | 'max_steps';
    constructor(breaker: 'max_depth' | 'max_steps', message: string);
}
/** 深度熔断：防止大模型幻觉导致无限嵌套套娃。 */
export declare function assertCanDescend(parent: AgentNode, childDepth: number): void;
/** 步数熔断：防止状态机死循环。 */
export declare function assertCanStep(node: AgentNode): void;
//# sourceMappingURL=circuit-breaker.d.ts.map