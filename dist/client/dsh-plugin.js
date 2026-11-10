// @ts-nocheck
/**
 * dsh 客户端插件入口（浏览器半）。
 *
 * 减法后不再替换宿主的侧栏浏览器（不注册 sidebar.workspaces，不照抄 WorkspaceBrowser）。
 * 只保留会话维度的东西：
 *   - 输入框工具条里的 workflow 状态徽标（当前状态 / 推进 / 实施清单）；
 *   - 设置页里的「操作细节」分区（应用级 A/B/C/D）。
 */
import { applyWorkflowComposerBadge } from './workflow-embedded';
import { applyWorkflowSettingsSection } from './workflow-dialogs';
export const name = 'dsh-agent-workflow-client';
export const inject = ['slots'];
export function apply(ctx) {
    // 输入框工具条里的 workflow 状态徽标（权限控件右边）。
    try {
        applyWorkflowComposerBadge(ctx);
    }
    catch (error) {
        console.error('[dsh-agent-workflow] 状态徽标注册失败：', error);
    }
    // 设置页里的「操作细节」（应用级全局 A/B/C/D）。
    try {
        applyWorkflowSettingsSection(ctx);
    }
    catch (error) {
        console.error('[dsh-agent-workflow] 设置分区注册失败：', error);
    }
}
//# sourceMappingURL=dsh-plugin.js.map