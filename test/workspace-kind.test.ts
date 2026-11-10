import { describe, expect, it } from 'vitest';
import { WORKSPACE_KINDS, WorkspaceKind, workspaceKindIconKey } from '../src/client/workspace-kind';

describe('workspace 类型注册表', () => {
  it('两类工作区：usual 用文件夹图标、workflow 用树结构图标', () => {
    expect(WORKSPACE_KINDS.map((definition) => definition.id)).toEqual([WorkspaceKind.Usual, WorkspaceKind.Workflow]);
    expect(workspaceKindIconKey(WorkspaceKind.Usual)).toBe('folder');
    expect(workspaceKindIconKey(WorkspaceKind.Workflow)).toBe('tree');
  });

  it('下拉框文案不拼接类型后缀', () => {
    for (const definition of WORKSPACE_KINDS) {
      expect(definition.label).not.toContain('（');
      expect(definition.label).not.toContain('usual');
      expect(definition.label).not.toContain('workflow');
    }
  });
});
