import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCandidateProjects, nearestProject, resolveProjects } from '../src/host/project-root';

describe('项目根解析：范围 → 项目根 / 候选', () => {
  async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'proj-root-'));
    try {
      await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('nearestProject：向上找最近的 marker', async () => {
    await withDir(async (base) => {
      const project = join(base, 'proj');
      const deep = join(project, 'src', 'deep');
      await mkdir(deep, { recursive: true });
      await writeFile(join(project, 'pyproject.toml'), '[project]\n', 'utf8');
      const found = await nearestProject(deep);
      expect(found?.root).toBe(project);
      expect(found?.stack).toBe('python');
    });
  });

  it('resolveProjects：范围落到不同项目 → 两个根（各自栈）', async () => {
    await withDir(async (base) => {
      const py = join(base, 'pyproj');
      const js = join(base, 'jsproj');
      await mkdir(py, { recursive: true });
      await mkdir(js, { recursive: true });
      await writeFile(join(py, 'pyproject.toml'), '[project]\n', 'utf8');
      await writeFile(join(js, 'package.json'), '{}', 'utf8');
      const resolution = await resolveProjects(base, ['pyproj', 'jsproj']);
      expect(resolution.projects).toHaveLength(2);
      expect(resolution.projects.map((project) => project.stack).sort()).toEqual(['js', 'python']);
    });
  });

  it('resolveProjects：范围为空 → 退回工作目录所属项目', async () => {
    await withDir(async (base) => {
      await writeFile(join(base, 'package.json'), '{}', 'utf8');
      const resolution = await resolveProjects(base, []);
      expect(resolution.projects).toHaveLength(1);
      expect(resolution.projects[0]?.stack).toBe('js');
    });
  });

  it('resolveProjects：都找不到 → 候选（一级子目录里带 marker 的）', async () => {
    await withDir(async (base) => {
      const child = join(base, 'child');
      await mkdir(child, { recursive: true });
      await writeFile(join(child, 'pyproject.toml'), '[project]\n', 'utf8');
      const resolution = await resolveProjects(base, []);
      expect(resolution.projects).toHaveLength(0);
      expect(resolution.candidates).toContain(child);
    });
  });

  it('listCandidateProjects：工作目录自己是项目根也算候选', async () => {
    await withDir(async (base) => {
      await writeFile(join(base, 'package.json'), '{}', 'utf8');
      expect(await listCandidateProjects(base)).toContain(base);
    });
  });
});
