/**
 * 「添加工作区」弹窗：两个入口——默认工作区 / Workflow 工作区。
 * TODO(spike): 挂到 dsh-web-app 的「添加工作区」扩展点。
 */
export function AddWorkspaceDialog(props: {
  onAddDefault: () => void;
  onAddWorkflow: () => void;
}) {
  return (
    <div className="dsh-workflow-add-workspace-dialog">
      <button type="button" onClick={props.onAddDefault}>
        默认工作区
      </button>
      <button type="button" onClick={props.onAddWorkflow}>
        Workflow 工作区
      </button>
    </div>
  );
}
