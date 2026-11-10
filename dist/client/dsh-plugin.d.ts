/**
 * dsh 客户端插件入口（浏览器半）。
 *
 * 减法后不再替换宿主的侧栏浏览器（不注册 sidebar.workspaces，不照抄 WorkspaceBrowser）。
 * 只保留会话维度的东西：
 *   - 输入框工具条里的 workflow 状态徽标（当前状态 / 推进 / 实施清单）；
 *   - 设置页里的「操作细节」分区（应用级 A/B/C/D）。
 */
export declare const name = "dsh-agent-workflow-client";
export declare const inject: string[];
export declare function apply(ctx: any): void;
//# sourceMappingURL=dsh-plugin.d.ts.map