import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { resolveProjectPython, resolvePython } from '../src/host/tool-locate';

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

  it('resolveProjectPython：优先 .venv，没有 → null', async () => {
    const venv = join('C:\\proj', '.venv', 'Scripts', 'python.exe');
    const found = await resolveProjectPython('C:\\proj', { platform: 'win32', exists: mockExists([venv]) });
    expect(found).toBe(venv);
    const none = await resolveProjectPython('C:\\proj2', { platform: 'win32', exists: mockExists([]) });
    expect(none).toBeNull();
  });

  it('resolveProjectPython：venv（不带点）也认', async () => {
    const venv = join('C:\\proj', 'venv', 'Scripts', 'python.exe');
    const found = await resolveProjectPython('C:\\proj', { platform: 'win32', exists: mockExists([venv]) });
    expect(found).toBe(venv);
  });
});
