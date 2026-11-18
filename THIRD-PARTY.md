# 第三方工具与致谢

本插件的七项验收里，机器检查交给成熟的社区工具做——插件只负责**执行它们、解析产物**并报出不合格项。

工具按三种方式随插件分发：

1. **JS 工具**（vitest / dependency-cruiser / knip / autocannon）：列在 `package.json` 的 `dependencies` 里，npm 安装即带。
2. **Python 工具**（pytest / pytest-json-report / import-linter / vulture + 依赖）：以 wheel 形式放在 `python-wheels/`，`postinstall` 用 `pip install --no-index` 离线装进 DSH 自带的 Python。**这套 wheel 是 Windows + CPython 3.12（amd64）专用**（grimp 是编译扩展）。
3. **Go 工具**（staticcheck）：单文件二进制放在 `tools/staticcheck/staticcheck.exe`。

例外：Go 的 `go build` / `go test` 需要完整 Go 工具链，**不随插件分发**；探测不到就降级 AI 证据。

下面列出的每一个项目，都是某一项验收的真正实现者——插件做的是调用、判定与记录。

---

## JS 工具

### dependency-cruiser

- **作者 / 维护者**：Sander Verweij（sverweij）与贡献者
- **项目地址**：<https://github.com/sverweij/dependency-cruiser>
- **License**：MIT
- **插件怎么用**：第 2 项「依赖检查」读它 `--output-type json` 的产物，判定循环依赖与跨层引用
- **致谢**：把架构规则写成配置、而不是手写扫描器，是它替我们做掉了最难的那部分

### knip

- **作者 / 维护者**：Webpro 与贡献者
- **项目地址**：<https://github.com/webpro-nl/knip>
- **License**：ISC
- **插件怎么用**：第 3 项「死代码扫描」读它 `--reporter json` 的产物
- **致谢**：「未使用导出 / 依赖」长期靠猜，knip 让它变成一次可复现的扫描

### Vitest

- **作者 / 维护者**：Vitest 团队（Anthony Fu 等）与贡献者
- **项目地址**：<https://github.com/vitest-dev/vitest>
- **License**：MIT
- **插件怎么用**：第 1 / 4 项读它 `--reporter=json` 的测试结果（契约测试、边界测试各出一份证据）
- **致谢**：验收里「跑过了没有」这类事实，最终都落在它产出的报告上

### autocannon

- **作者 / 维护者**：Matteo Collina（mcollina）与贡献者
- **项目地址**：<https://github.com/mcollina/autocannon>
- **License**：MIT
- **插件怎么用**：第 7 项「回归与压测」用它的压测结果（`total` / `failed` / `durationMs`）作为证据
- **致谢**：并发压测这件事，自己写调度只会写出一个更差的 autocannon

---

## Python 工具（`python-wheels/` 离线安装）

### pytest

- **作者 / 维护者**：pytest 团队（Holger Krekel 等）与贡献者
- **项目地址**：<https://github.com/pytest-dev/pytest>
- **License**：MIT
- **插件怎么用**：第 1 / 4 项（Python 栈）跑 `python -m pytest --json-report`，读 json-report 产物
- **致谢**：Python 生态的事实标准测试运行器

### pytest-json-report

- **作者 / 维护者**：numirias 与贡献者
- **项目地址**：<https://github.com/numirias/pytest-json-report>
- **License**：MIT
- **插件怎么用**：给 pytest 加 `--json-report`，产出 `summary.total / summary.failed`
- **致谢**：把 pytest 的运行结果变成可判定的 JSON

### import-linter

- **作者 / 维护者**：seddonym 与贡献者
- **项目地址**：<https://github.com/seddonym/import-linter>
- **License**：BSD 2-Clause
- **插件怎么用**：第 2 项（Python 栈）跑 console script `lint-imports`，解析文本报告的 `Broken contracts` 段
- **致谢**：把 import 边界规则写成配置

### vulture

- **作者 / 维护者**：Jendrik Seipp 与贡献者
- **项目地址**：<https://github.com/jendrikseipp/vulture>
- **License**：MIT
- **插件怎么用**：第 3 项（Python 栈）跑 `python -m vulture`，解析 `path:line: unused ...`
- **致谢**：找出 Python 里「写了没人用」的代码

---

## Go 工具（`tools/` 二进制）

### staticcheck

- **作者 / 维护者**：Dominik Honnef（dominikh）与贡献者
- **项目地址**：<https://github.com/dominikh/go-tools>
- **License**：MIT
- **插件怎么用**：第 3 项（Go 栈）跑 vendored 的 `staticcheck ./...`，解析 `file:line:col: U1000: ...`
- **致谢**：Go 静态分析的标杆

---

## 说明

- JS 工具由本插件声明为运行依赖，随插件一起安装；插件**调用它们的 CLI、读取产物的 JSON**，不修改它们的代码。
- Python 工具以 wheel 形式随插件分发（`python-wheels/`），`postinstall` 离线安装；插件**调用它们的 CLI / `-m` 入口、解析产物**，不修改它们的代码。
- staticcheck 以单文件二进制随插件分发（`tools/staticcheck/`），插件**调用它的 CLI、解析文本输出**。
- 本仓库不包含上述项目的源码；wheel 与二进制由各自的上游发布。它们的 License 由各自的包 / 二进制携带。
- 如果你在项目里直接使用这些工具（而不是通过本插件），请遵守各自的 License。
- **版本锁定**：JS 工具在 `package.json` 里固定到**精确版本**（不带 `^`）；Python 工具固定在 `python-wheels/` 的 wheel 文件名里；staticcheck 固定在 `tools/staticcheck/` 的二进制版本。原因是检查器直接解析它们的产物——任何一个工具的产物格式一变，对应验收项就会误判。升级任何一个工具前，必须：① 跑一次真实产物核对字段；② 全量跑一遍七项验收确认没静默降级；③ 在本文件同步版本号。由插件作者跟进，不接受自动升级。

## 新增外部工具时的约定

引入新的外部工具（调用它、读它的产物）时，在同一提交里：

1. 在本文档加一节：作者 / 地址 / License / 插件怎么用 / 一句致谢；
2. 在 `README.md` 的「致谢」一节补链接；
3. 如果界面会显示该工具的名字，界面上也带出处；
4. 把它的真实产物跑一遍，用真实字段校准解析代码——不要照文档猜字段；
5. Python 工具补进 `python-wheels/`（按平台 `pip download`），Go 单文件工具补进 `tools/`；同步更新 `scripts/setup-python-tools.mjs` 的安装包列表。
