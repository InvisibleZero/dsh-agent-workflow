/**
 * 级联打断：父节点被打断时，递归通知所有子孙立刻停止。
 * 从最深层往上层停（先停叶子，再停根），避免父级先停导致子级状态悬空。
 */
export async function cascadeInterrupt(descendantsOf, rootId, stop) {
    const ids = descendantsOf(rootId);
    for (const id of [...ids].reverse()) {
        await stop.stop(id);
    }
    await stop.stop(rootId);
}
//# sourceMappingURL=interrupt.js.map