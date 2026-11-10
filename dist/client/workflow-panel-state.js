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
export const INITIAL_WORKFLOW_PANEL_STATE = {
    view: 'form',
    name: '',
    phase: 'idle',
    notice: null,
    created: null,
};
/** 正在调宿主、按钮该锁住的阶段。 */
export function isWorkflowPanelBusy(state) {
    return state.phase === 'picking' || state.phase === 'creating';
}
/**
 * 唯一的转移函数。约定：
 * - `submit` 只负责进入 picking，真正的副作用留在组件里，状态机保持纯函数。
 * - 用户取消选文件夹 → 回到 idle，不留提示（取消不是错误）。
 * - 建好 → 切到 success 面（不再回到空白表单），并记下标题与路径。
 * - 改名失败不算整体失败，只在文案里说明。
 * - 失败后改输入即清掉错误，避免「改了还得盯着旧报错」。
 */
export function reduceWorkflowPanel(state, action) {
    switch (action.kind) {
        case 'name-changed':
            return { ...state, name: action.name, phase: 'idle', notice: null };
        case 'submit':
            return isWorkflowPanelBusy(state) ? state : { ...state, phase: 'picking', notice: null };
        case 'pick-cancelled':
            return { ...state, phase: 'idle', notice: null };
        case 'picked':
            return { ...state, phase: 'creating' };
        case 'created': {
            const suffix = action.renameFailed ? '（改名失败，用的是文件夹名）' : '';
            // 用「已就绪」而不是「已创建」：宿主的 create 是幂等的，选一个已经登记过的目录
            // 也会走成功分支，客户端拿不到「这次是不是新建」的标志。
            return {
                ...INITIAL_WORKFLOW_PANEL_STATE,
                view: 'success',
                created: { title: action.title, path: action.path },
                notice: { tone: 'success', text: `工作区「${action.title}」已就绪${suffix}` },
            };
        }
        case 'failed':
            return { ...state, phase: 'error', notice: { tone: 'error', text: action.message } };
        case 'close':
            return { ...INITIAL_WORKFLOW_PANEL_STATE, view: 'closed' };
        case 'reopen':
            return { ...INITIAL_WORKFLOW_PANEL_STATE };
    }
}
//# sourceMappingURL=workflow-panel-state.js.map