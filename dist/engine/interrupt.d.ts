/** 停止端口：由运行时适配器实现，引擎不关心具体怎么停。 */
export interface StopPort {
    stop(nodeId: string): Promise<void>;
}
/**
 * 级联打断：父节点被打断时，递归通知所有子孙立刻停止。
 * 从最深层往上层停（先停叶子，再停根），避免父级先停导致子级状态悬空。
 */
export declare function cascadeInterrupt(descendantsOf: (id: string) => string[], rootId: string, stop: StopPort): Promise<void>;
//# sourceMappingURL=interrupt.d.ts.map