import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { resolveGo, resolvePython, vendoredStaticcheck } from '../src/host/tool-locate';

function mockExists(files: string[]): (file: string) => Promise<boolean> {
  const set = new Set(files);
  return async (file: string) => set.has(file);
}

describe('工具定位：不靠 PATH，主动找绝对路径', () => {
  it('resolvePython：环境变量优先', async () => {
    const p = await resolvePython({
      env: { DSH_PYTHON: '/custom/python' },
      home: '/home/u',
      platform: 'linux',
      exists: mockExists(['/custom/python']),
    });
    expect(p).toBe('/custom/python');
  });

  it('resolvePython：环境变量无效时退回 dsh-runtimes 已知位置', async () => {
    const expected = join('/home/u', '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'bin', 'python3');
    const p = await resolvePython({
      env: {},
      home: '/home/u',
      platform: 'linux',
      exists: mockExists([expected]),
    });
    expect(p).toBe(expected);
  });

  it('resolvePython：都没有 → null（不退回裸 python）', async () => {
    const p = await resolvePython({ env: {}, home: '/home/u', platform: 'linux', exists: mockExists([]) });
    expect(p).toBeNull();
  });

  it('resolveGo：win32 常见位置', async () => {
    const p = await resolveGo({
      env: {},
      home: 'C:\\Users\\u',
      platform: 'win32',
      exists: mockExists(['C:\\Program Files\\Go\\bin\\go.exe']),
    });
    expect(p).toBe('C:\\Program Files\\Go\\bin\\go.exe');
  });

  it('resolveGo：环境变量优先', async () => {
    const p = await resolveGo({
      env: { DSH_GO: '/opt/go/bin/go' },
      home: '/home/u',
      platform: 'linux',
      exists: mockExists(['/opt/go/bin/go']),
    });
    expect(p).toBe('/opt/go/bin/go');
  });

  it('resolveGo：找不到 → null（调用方降级 AI 证据）', async () => {
    const p = await resolveGo({ env: {}, home: '/home/u', platform: 'linux', exists: mockExists([]) });
    expect(p).toBeNull();
  });

  it('vendoredStaticcheck：按平台拼 tools/staticcheck', () => {
    expect(vendoredStaticcheck('/plugin')).toContain('tools');
    expect(vendoredStaticcheck('/plugin')).toContain('staticcheck');
  });
});
