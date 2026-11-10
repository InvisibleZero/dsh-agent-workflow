// @ts-nocheck
/**
 * dsh 客户端插件入口（浏览器半）。
 *
 * 只做一件事：注册伪装层 `sidebar.workspaces`（替换宿主的目录工作区浏览器）。
 * workflow 工作区不是独立入口，而是「添加工作区」下拉框里的一个类型，
 * 在侧栏工作区区域内原地渲染（每种类型一个可嵌入渲染器）。
 */

import { applyWorkspaceBrowser } from './workspace-browser';
import { workflowKindPlugin, applyWorkflowComposerBadge } from './workflow-embedded';
import { applyWorkflowSettingsSection } from './workflow-dialogs';
import { registerWorkspaceKindPlugin } from './workspace-kind-registry';

export const name = 'dsh-agent-workflow-client';

// `remote` + `remote.workspace`：置顶桥要直连 workspaceController 的 Remote 端点。
//   注意：只注入 remote 不够，访问子属性还要显式声明 "remote.workspace"，
//   否则抛 'cannot get property "remote.workspace" without inject'。
// `shortcuts`：宿主的会话菜单项（重命名/分叉/归档）要用 ctx.shortcuts.catalog 作为 hooks.shortcuts，
//   缺了会抛 "useShortcuts is not a function"。
export const inject = ['slots', 'remote', 'remote.workspace', 'shortcuts'];

export function apply(ctx: any) {
  // 装配点：把 workflow 类型挂进工作区类型注册表（唯一的跨模块耦合点，另两处是枚举与注册表本身）。
  registerWorkspaceKindPlugin(workflowKindPlugin);

  try {
    applyWorkspaceBrowser(ctx);
  } catch (error) {
    console.error('[dsh-agent-workflow] 伪装层注册失败：', error);
  }

  // 输入框工具条里的 workflow 状态徽标（权限控件右边）。挂不上不影响侧栏主功能。
  try {
    applyWorkflowComposerBadge(ctx);
  } catch (error) {
    console.error('[dsh-agent-workflow] 状态徽标注册失败：', error);
  }

  // 设置页里的「操作细节」（应用级全局 A/B/C/D）。
  try {
    applyWorkflowSettingsSection(ctx);
  } catch (error) {
    console.error('[dsh-agent-workflow] 设置分区注册失败：', error);
  }
}
