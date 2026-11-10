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

/** 假 ctx：只实现客户端入口真正用到的 slots 服务，并把注册原样记下来。 */
function makeCtx(captured: Captured[], options: { registerThrows?: boolean } = {}) {
  return {
    slots: {
      inject(_key: string, callback: () => unknown) {
        callback();
        return () => {};
      },
      register(registration: Captured & { name: string }, component: unknown) {
        if (options.registerThrows === true) throw new Error('槽位已被占用');
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
  it('只声明 slots 一个硬依赖', () => {
    expect(inject).toEqual(['slots']);
  });

  it('注册会话维度的四个槽位，且不再碰工作区浏览器', () => {
    const captured: Captured[] = [];
    apply(makeCtx(captured));

    expect(captured.map((item) => item.slot).sort()).toEqual([
      'conversation.input.left',
      'settings.section',
      'settings.section.icon',
      'sidebar.session.row.trailing',
    ]);

    // 旧版替换宿主侧栏/主面板的那套已撤掉。
    expect(captured.some((item) => item.slot === 'sidebar.workspaces')).toBe(false);
    expect(captured.some((item) => item.slot === 'sidebar.panellist')).toBe(false);
    expect(captured.some((item) => item.slot === 'main')).toBe(false);

    // 各槽位用插件自己的 id，避免顶掉宿主条目。
    const stateBadge = captured.find((item) => item.slot === 'conversation.input.left');
    expect(stateBadge?.id).toBe('dsh-agent-workflow.state');
    const stateDot = captured.find((item) => item.slot === 'sidebar.session.row.trailing');
    expect(stateDot?.id).toBe('dsh-agent-workflow.state-dot');
  });

  it('某个槽位注册失败不拖垮整页启动', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => apply(makeCtx([], { registerThrows: true }))).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
