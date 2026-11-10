"use strict";
// @ts-nocheck
/**
 * dsh 客户端插件入口（浏览器半）。
 *
 * 减法后不再替换宿主的侧栏浏览器（不注册 sidebar.workspaces，不照抄 WorkspaceBrowser）。
 * 只保留会话维度的东西：
 *   - 输入框工具条里的 workflow 状态徽标（当前状态 / 推进 / 实施清单）；
 *   - 设置页里的「操作细节」分区（应用级 A/B/C/D）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = void 0;
exports.apply = apply;
const workflow_embedded_1 = require("./workflow-embedded");
const workflow_dialogs_1 = require("./workflow-dialogs");
exports.name = 'dsh-agent-workflow-client';
exports.inject = ['slots'];
function apply(ctx) {
    // 输入框工具条里的 workflow 状态徽标（权限控件右边）。
    try {
        (0, workflow_embedded_1.applyWorkflowComposerBadge)(ctx);
    }
    catch (error) {
        console.error('[dsh-agent-workflow] 状态徽标注册失败：', error);
    }
    // 设置页里的「操作细节」（应用级全局 A/B/C/D）。
    try {
        (0, workflow_dialogs_1.applyWorkflowSettingsSection)(ctx);
    }
    catch (error) {
        console.error('[dsh-agent-workflow] 设置分区注册失败：', error);
    }
}
//# sourceMappingURL=dsh-plugin.js.map