import { describe, expect, it, vi } from 'vitest';
import { apply, inject } from '../src/client/dsh-plugin';

// ui-primitives 是宿主模块表提供的 dsh 内部模块，插件 node_modules 里没有；
// 单测里 mock 掉，只保证模块能加载（组件渲染不在本测试范围）。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: () => null,
  IconPinFillRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  IconArchiveOutlineRegular: () => null,
  IconTriangleRightFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
  IconSlidersTwoOutlineRegular: () => null,
  IconFolderOpenRegular: () => null,
  IconFolderCloseRegular: () => null,
  IconEditOutlineRegular: () => null,
  IconTrashOutlineRegular: () => null,
  Menu: () => null,
  HoverCard: () => null,
  Tooltip: () => null,
  relativeTime: () => ({ unit: 'now', n: 0 }),
}));

interface Captured {
  slot: string;
  id?: string;
  key?: string;
  order?: number;
  label?: string | (() => string);
}

/** 假 ctx.slots：只实现 apply 真正用到的两个方法，并把注册原样记下来。 */
function makeCtx(captured: Captured[], tabTypes: Array<Record<string, unknown>> = [], options: { injectThrows?: boolean } = {}) {
  return {
    // tab 类型走 ctx.inject(['sidebarRightTabs'], ...)，这里给一个能记账的假注册表。
    inject(_deps: string[], callback: (ctx: any) => void) {
      callback({
        effect: (fn: () => unknown) => {
          const dispose = fn();
          return typeof dispose === 'function' ? dispose : () => {};
        },
        sidebarRightTabs: {
          register(definition: Record<string, unknown>) {
            tabTypes.push(definition);
            return () => {};
          },
        },
      });
    },
    slots: {
      inject(_key: string, callback: () => unknown) {
        if (options.injectThrows === true) throw new Error('slots 服务未就绪');
        callback();
        return () => {};
      },
      register(registration: Captured & { name: string }, component: unknown) {
        if (typeof component !== 'function') throw new Error('注册的组件必须是函数');
        captured.push({
          slot: registration.name,
          id: registration.id,
          key: registration.key,
          order: registration.order,
          label: registration.label,
        });
        return () => {};
      },
    },
  } as any;
}

describe('dsh-agent-workflow 客户端入口', () => {
  it('声明 slots / remote / shortcuts 三个硬依赖', () => {
    expect(inject).toContain('slots');
    // remote：置顶桥直连 workspaceController
    expect(inject).toContain('remote');
    // shortcuts：宿主会话菜单项需要 hooks.shortcuts = ctx.shortcuts.catalog
    expect(inject).toContain('shortcuts');
  });

  it('只注册伪装层 sidebar.workspaces（导航项与主面板已撤掉）', () => {
    const captured: Captured[] = [];
    const tabTypes: Array<Record<string, unknown>> = [];
    apply(makeCtx(captured, tabTypes));

    expect(captured).toHaveLength(1);

    const browser = captured.find((item) => item.slot === 'sidebar.workspaces');
    expect(browser).toBeDefined();

    // 左侧导航项与主面板弹窗都应撤掉。
    expect(captured.some((item) => item.slot === 'sidebar.panellist')).toBe(false);
    expect(captured.some((item) => item.slot === 'main')).toBe(false);

    // 右侧栏那套也全部撤掉。
    expect(captured.some((item) => item.slot === 'sidebar.right.pane.tab')).toBe(false);
    expect(captured.some((item) => item.slot === 'conversation.session.header.utilities')).toBe(false);
    expect(captured.some((item) => item.slot === 'sidebar.footer.action')).toBe(false);
    // 也不再注册右侧栏 tab 类型。
    expect(tabTypes).toHaveLength(0);
  });

  it('槽位注册失败时向上抛出之前先兜住（不能拖垮整页启动）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => apply(makeCtx([], [], { injectThrows: true }))).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
