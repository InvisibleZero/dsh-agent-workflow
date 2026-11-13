import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../src/host/command-runner';

describe('runCommand：检查命令的执行与失败语义', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wf-cmd-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('exit 0：ok=true、退出码 0、能看到输出', async () => {
    const result = await runCommand({ cwd: dir, command: 'node -e "console.log(42)"' });
    expect(result.ok).toBe(true);
    expect(result.exit_code).toBe(0);
    expect(result.timed_out).toBe(false);
    expect(result.tail).toContain('42');
  });

  it('非 0 退出：ok=false、退出码带出来', async () => {
    const result = await runCommand({ cwd: dir, command: 'node -e "console.error(\'boom\'); process.exit(3)"' });
    expect(result.ok).toBe(false);
    expect(result.exit_code).toBe(3);
    expect(result.tail).toContain('boom');
  });

  it('超时：timed_out=true、进程被杀', async () => {
    const result = await runCommand({
      cwd: dir,
      command: 'node -e "setTimeout(() => {}, 5000)"',
      timeoutMs: 300,
    });
    expect(result.timed_out).toBe(true);
    expect(result.ok).toBe(false);
  }, 15000);

  it('支持 shell 重定向：产物真的落盘', async () => {
    const result = await runCommand({ cwd: dir, command: 'node -e "console.log(7)" > out.txt' });
    expect(result.ok).toBe(true);
    const text = await readFile(join(dir, 'out.txt'), 'utf8');
    expect(text.trim()).toBe('7');
  });

  it('命令不存在：不抛异常，按失败返回', async () => {
    const result = await runCommand({ cwd: dir, command: 'this-command-does-not-exist-xyz' });
    expect(result.ok).toBe(false);
    expect(result.exit_code).not.toBe(0);
  });

  it('输出只留尾部：不超过 4KB', async () => {
    const result = await runCommand({
      cwd: dir,
      command: 'node -e "process.stdout.write(\'x\'.repeat(20000))"',
    });
    expect(result.ok).toBe(true);
    expect(result.tail.length).toBeLessThanOrEqual(4096);
  });
});
