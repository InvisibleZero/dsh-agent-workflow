import type { StateDetail } from '../schema/node-state';
/**
 * 状态操作细节编辑器：每个状态拆成「操作细节」与「进入后默认输入」两个独立输入框。
 * - 输入框一（textarea）：操作细节
 * - 输入框二（input）：进入该状态后自动触发的默认输入（可空）
 */
export declare function StateDetailEditor(props: {
    label: string;
    value: StateDetail;
    onChange: (value: StateDetail) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=node-state-editor.d.ts.map