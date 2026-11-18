# python-wheels

离线安装 Python 检查器工具用的本地 wheel。

**平台：Windows + CPython 3.12（amd64）专用。** `grimp`（import-linter 的依赖）是编译扩展
（`grimp-*-cp312-cp312-win_amd64.whl`），不是纯 Python，所以这套 wheel 不能跨平台。
Linux/macOS 需要各自平台重新 `pip download`。

包含：

- `pytest-*.whl` + 依赖（iniconfig / packaging / pluggy / colorama / pygments）
- `pytest-json-report-*.whl` + `pytest-metadata-*.whl`
- `import-linter-*.whl` + `grimp-*.whl` + `rich` / `markdown-it-py` / `mdurl` / `click`
- `vulture-*.whl`

`scripts/setup-python-tools.mjs` 在 `postinstall` 时用 `pip install --no-index --find-links .`
装进 DSH 自带的 Python（`DSH_PYTHON`）。没有 wheel 时脚本 warn + 跳过，checker 走
「工具缺失 → 降级 AI 证据」，不影响插件其它功能。

重新生成（联网环境）：

```powershell
python -m pip download pytest pytest-json-report import-linter vulture -d python-wheels
```
