/**
 * 「新建 Workflow 工作区」弹窗的纯状态机。
 *
 * 三个面：form（填表）/ success（建好了）/ closed（关掉了）。
 * 之前只有 form 一个面、建完把名字清空，看起来跟"回到初始界面"一样，
 * 用户会以为没建成 —— 所以"建好"必须是独立的一面，不能靠一行小字。
 *
 * 抽成纯函数的原因：这条流程是异步的（选文件夹 → 建工作区 → 可能改名），
 * 埋在组件里只能用 jsdom 去点，靠这个函数就能在 node 里逐条断言。
 * 这里不 import react，也不 import 任何 schema（带 zod 的模块一律不许进客户端）。
 */
export type WorkflowPanelView = 'form' | 'success' | 'closed';
/**
 * form 面里的进度：
 * idle = 待填；picking = 等用户选文件夹；creating = 已拿到目录、正在建；error = 选目录或建工作区失败。
 */
export type WorkflowPanelPhase = 'idle' | 'picking' | 'creating' | 'error';
export interface WorkflowPanelNotice {
    tone: 'success' | 'error';
    text: string;
}
export interface CreatedWorkspace {
    title: string;
    path: string;
}
export interface WorkflowPanelState {
    view: WorkflowPanelView;
    name: string;
    phase: WorkflowPanelPhase;
    notice: WorkflowPanelNotice | null;
    created: CreatedWorkspace | null;
}
export declare const INITIAL_WORKFLOW_PANEL_STATE: WorkflowPanelState;
export type WorkflowPanelAction = {
    kind: 'name-changed';
    name: string;
} | {
    kind: 'submit';
} | {
    kind: 'pick-cancelled';
} | {
    kind: 'picked';
} | {
    kind: 'created';
    title: string;
    path: string;
    renameFailed: boolean;
} | {
    kind: 'failed';
    message: string;
} | {
    kind: 'close';
} | {
    kind: 'reopen';
};
/** 正在调宿主、按钮该锁住的阶段。 */
export declare function isWorkflowPanelBusy(state: WorkflowPanelState): boolean;
/**
 * 唯一的转移函数。约定：
 * - `submit` 只负责进入 picking，真正的副作用留在组件里，状态机保持纯函数。
 * - 用户取消选文件夹 → 回到 idle，不留提示（取消不是错误）。
 * - 建好 → 切到 success 面（不再回到空白表单），并记下标题与路径。
 * - 改名失败不算整体失败，只在文案里说明。
 * - 失败后改输入即清掉错误，避免「改了还得盯着旧报错」。
 */
export declare function reduceWorkflowPanel(state: WorkflowPanelState, action: WorkflowPanelAction): WorkflowPanelState;
//# sourceMappingURL=workflow-panel-state.d.ts.map