# 第三方工具与致谢

本插件的七项验收里，有四项交给成熟的社区工具做，插件只负责**解析它们的产物**并报出不合格项。

这四个工具**随插件一起分发**（列在 `package.json` 的 `dependencies` 里）：拉下插件就装好了，不需要项目自己再装一遍。
下面列出的每一个项目，都是某一项验收的真正实现者——插件做的是判定与记录。

---

## dependency-cruiser

- **作者 / 维护者**：Sander Verweij（sverweij）与贡献者
- **项目地址**：<https://github.com/sverweij/dependency-cruiser>
- **License**：MIT
- **插件怎么用**：第 2 项「依赖检查」读它 `--output-type json` 的产物，判定循环依赖与跨层引用
- **致谢**：把架构规则写成配置、而不是手写扫描器，是它替我们做掉了最难的那部分

## knip

- **作者 / 维护者**：Webpro 与贡献者
- **项目地址**：<https://github.com/webpro-nl/knip>
- **License**：ISC
- **插件怎么用**：第 3 项「死代码扫描」读它 `--reporter json` 的产物
- **致谢**：「未使用导出 / 依赖」长期靠猜，knip 让它变成一次可复现的扫描

## Vitest

- **作者 / 维护者**：Vitest 团队（Anthony Fu 等）与贡献者
- **项目地址**：<https://github.com/vitest-dev/vitest>
- **License**：MIT
- **插件怎么用**：第 1 / 4 项读它 `--reporter=json` 的测试结果（契约测试、边界测试各出一份证据）
- **致谢**：验收里「跑过了没有」这类事实，最终都落在它产出的报告上

## autocannon

- **作者 / 维护者**：Matteo Collina（mcollina）与贡献者
- **项目地址**：<https://github.com/mcollina/autocannon>
- **License**：MIT
- **插件怎么用**：第 7 项「回归与压测」用它的压测结果（`total` / `failed` / `durationMs`）作为证据
- **致谢**：并发压测这件事，自己写调度只会写出一个更差的 autocannon

---

## 说明

- 四个工具都由本插件声明为运行依赖，随插件一起安装；插件**调用它们的 CLI、读取产物的 JSON**，不修改它们的代码。
- 本仓库不包含上述项目的源码，不重新分发它们的代码包；它们的 License 由各自的 npm 包携带。
- 如果你在项目里直接使用这些工具（而不是通过本插件），请遵守各自的 License。

## 新增外部工具时的约定

引入新的外部工具（调用它、读它的产物）时，在同一提交里：

1. 在本文档加一节：作者 / 地址 / License / 插件怎么用 / 一句致谢；
2. 在 `README.md` 的「致谢」一节补链接；
3. 如果界面会显示该工具的名字，界面上也带出处；
4. 把它的真实产物跑一遍，用真实字段校准解析代码——不要照文档猜字段。
