import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stackFromMarkers, type Stack } from '../src/engine/checkers/stack';
import { depsCommandFor } from '../src/engine/checkers/deps';
import { detectStack } from '../src/host/stack-detect';

describe('技术栈探测（纯规则 stackFromMarkers）', () => {
  it('优先级 pyproject.toml > package.json', () => {
    expect(stackFromMarkers({ pyproject: true, packageJson: true })).toBe('python');
    expect(stackFromMarkers({ pyproject: false, packageJson: true })).toBe('js');
  });

  it('一个 marker 都没有：返回 null（调用方降级 AI 证据）', () => {
    expect(stackFromMarkers({ pyproject: false, packageJson: false })).toBeNull();
  });
});

describe('check_deps 按栈选命令（depsCommandFor）', () => {
  it('js 用 depcruise，python 用 lint-imports', () => {
    expect(depsCommandFor('js', 'src')).toContain('depcruise');
    expect(depsCommandFor('python', 'src')).toContain('lint-imports');
  });

  it('两栈命令都往同一个证据文件 deps.json 落产物', () => {
    for (const stack of ['js', 'python'] as Stack[]) {
      expect(depsCommandFor(stack, 'src')).toContain('deps.json');
    }
  });
});

describe('宿主侧探测（detectStack 从工作目录向上找 marker）', () => {
  async function withDir(files: Record<string, string>, run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'stack-detect-'));
    try {
      for (const [name, content] of Object.entries(files)) {
        await writeFile(join(dir, name), content, 'utf8');
      }
      await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('有 pyproject.toml → python', async () => {
    await withDir({ 'pyproject.toml': '[project]\nname="x"\n' }, async (dir) => {
      expect((await detectStack(dir)).stack).toBe('python');
    });
  });

  it('只有 package.json → js', async () => {
    await withDir({ 'package.json': '{}' }, async (dir) => {
      expect((await detectStack(dir)).stack).toBe('js');
    });
  });

  it('工作目录在项目子目录：向上命中项目根（root = marker 所在目录）', async () => {
    await withDir({}, async (base) => {
      const project = join(base, 'project');
      await mkdir(join(project, 'src', 'deep'), { recursive: true });
      await writeFile(join(project, 'pyproject.toml'), '[project]\nname="x"\n', 'utf8');
      const detection = await detectStack(join(project, 'src', 'deep'));
      expect(detection.stack).toBe('python');
      expect(detection.root).toBe(project);
    });
  });

  it('go.mod 不再触发 go（Go 支持已撤）', async () => {
    await withDir({ 'go.mod': 'module x\n' }, async (dir) => {
      expect((await detectStack(dir)).stack).toBeNull();
    });
  });
});
