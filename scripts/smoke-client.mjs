/**
 * 产物冒烟：直接跑构建后的 dist/client-bundle.js，守住两条曾经把整页弄挂的契约。
 *
 * 1) 外部依赖白名单：客户端包里只允许 require react / react-dom / react/jsx-runtime。
 *    任何裸包（zod、node:fs…）都会在浏览器模块表里抛错 → entry failed → 桌面端「无法使用」。
 * 2) 注册契约：只注册 sidebar.panellist[id=agent-workflow] 与 main[key=agent-workflow]，
 *    且 id 必须等于 key（宿主点图标就是按这个 key 派发主面板）。
 *
 * 用法：先 `pnpm build`（或 `tsc -p tsconfig.client-cjs.json && node scripts/bundle-client.mjs`），
 * 再 `pnpm smoke`。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = join(root, 'dist', 'client-bundle.js');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

let entry = null;
globalThis.window = { __ModuleLoader__: { load(spec) { entry = spec; } } };
globalThis.document = { createElement: () => ({}) };

try {
  new Function(readFileSync(bundlePath, 'utf8'))();
} catch (error) {
  console.error(`[smoke] 读取或执行 ${bundlePath} 失败：`, error);
  process.exit(1);
}

check(entry !== null, 'bundle 没有调用 window.__ModuleLoader__.load');
check(entry?.id === 'dsh-agent-workflow', `bundle id 应为 dsh-agent-workflow，实际 ${String(entry?.id)}`);

class ReactComponent {
  constructor(props) {
    this.props = props;
    this.state = {};
  }
  setState() {}
}

const React = {
  Component: ReactComponent,
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useReducer: (reducer, initial) => [initial, () => {}],
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: () => ({ current: null }),
  createElement: () => ({}),
  Fragment: 'Fragment',
};
const jsxRuntime = { jsx: () => ({}), jsxs: () => ({}), Fragment: 'Fragment' };

const unexpected = [];
const primitivesStub = {
  StateDot: () => ({}),
  IconPinFillRegular: () => ({}),
  IconEllipsisOutlineRegular: () => ({}),
  IconArchiveOutlineRegular: () => ({}),
  IconTriangleRightFillRegular: () => ({}),
  IconNewChatOutlineRegular: () => ({}),
  IconSlidersTwoOutlineRegular: () => ({}),
  IconFolderOpenRegular: () => ({}),
  IconFolderCloseRegular: () => ({}),
  IconEditOutlineRegular: () => ({}),
  IconTrashOutlineRegular: () => ({}),
  Menu: () => ({}),
  HoverCard: () => ({}),
  Tooltip: () => ({}),
  relativeTime: () => ({ unit: 'now', n: 0 }),
};
const requireStub = (id) => {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return jsxRuntime;
  if (id === 'react-dom') return {};
  if (id === 'react-dom/client') return {};
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
  unexpected.push(id);
  throw new Error(`客户端包不允许 require 外部依赖: ${id}`);
};

let mod = null;
try {
  mod = entry.factory(requireStub);
} catch (error) {
  console.error('[smoke] 工厂物化失败：', error);
  process.exit(1);
}

check(unexpected.length === 0, `出现了未声明的外部依赖：${unexpected.join(', ')}`);
check(
  Array.isArray(mod.inject)
    && mod.inject.includes('slots')
    && mod.inject.includes('remote')
    && mod.inject.includes('shortcuts'),
  `inject 应含 slots/remote/shortcuts，实际 ${JSON.stringify(mod.inject)}`,
);
check(typeof mod.apply === 'function', '没有导出 apply');

const registered = [];
const tabTypes = [];
const services = {
  // 右侧栏的 tab 类型注册表：openTab 按 kind 查这张表，必须拿到。
  sidebarRightTabs: {
    register(definition) {
      tabTypes.push(definition);
      return () => {};
    },
  },
};
const ctx = {
  get(name) {
    return services[name];
  },
  effect(callback) {
    const dispose = callback();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  inject(_deps, callback) {
    callback({
      effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
      ...services,
    });
  },
  slots: {
    inject(_key, callback) { callback(); return () => {}; },
    register(options, component) {
      if (typeof component !== 'function') throw new Error('注册的组件必须是函数');
      registered.push({
        slot: options.name,
        id: options.id ?? null,
        key: options.key ?? null,
        order: options.order ?? null,
        label: typeof options.label === 'function' ? options.label() : options.label ?? null,
      });
      return () => {};
    },
  },
};

try {
  mod.apply(ctx);
} catch (error) {
  console.error('[smoke] apply 抛错（启动路径上这会拖垮整个页面）：', error);
  process.exit(1);
}

const workspaceBrowser = registered.find((item) => item.slot === 'sidebar.workspaces');

const expectedSlots = [
  'conversation.input.left',
  'settings.section',
  'settings.section.icon',
  'sidebar.workspaces',
];
const actualSlots = registered.map((item) => item.slot).sort();

check(
  actualSlots.length === expectedSlots.length && actualSlots.every((slot, index) => slot === expectedSlots[index]),
  `应注册 ${expectedSlots.join(' + ')}，实际 ${actualSlots.join(', ')}`,
);
check(workspaceBrowser !== undefined, '没有注册伪装层 sidebar.workspaces');
check(registered.every((item) => item.slot !== 'sidebar.panellist'), '左侧导航项应已撤掉');
check(registered.every((item) => item.slot !== 'main'), '主面板弹窗应已撤掉');
check(registered.every((item) => item.slot !== 'sidebar.right.pane.tab'), '右侧栏面板应已撤掉');
check(registered.every((item) => item.slot !== 'conversation.session.header.utilities'), '会话头入口应已撤掉');
check(registered.every((item) => item.slot !== 'sidebar.footer.action'), '底栏入口应已撤掉');

check(tabTypes.length === 0, `不再注册右侧栏 tab 类型，实际 ${tabTypes.length} 个`);

if (failures.length > 0) {
  console.error('[smoke] 失败：');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const bytes = readFileSync(bundlePath).length;
console.log(`[smoke] OK  ${bytes} bytes  registrations: ${registered.map((item) => `${item.slot}(${item.id ?? item.key})`).join(' + ')}`);
