# 技术方案：qwen-code-action

# 方案概述

为填补 Qwen Code 与 GitHub Actions 生态的集成空白，本方案将基于 [run-gemini-cli](https://github.com/google-github-actions/run-gemini-cli/) 的成熟架构，开发适配 Qwen Code 的 qwen-code-action，支持 PR 评审、issue 分类、执行代码分析和修改等，直接在GitHub 仓库中通过 Qwen Code 对话式地完成（例如，`@qwen-code fix this issue` ）；同时优化 Qwen Code 的 `/setup-github` 命令，实现一键配置 workflow 模板，简化 Action 接入流程。

最终交付可直接在 GitHub workflow 中调用的 Action `qwen-code-action`以及更新后的  Qwen Code 源码，确保功能稳定、接入便捷，完善 Qwen Code 在自动化研发场景的落地能力。

# 竞品分析

## 核心功能

run-gemini-cli 主要包含以下几大功能模块：

* 自动化工作流集成：支持基于事件（如 Issue 创建、PR 提交）或定时任务触发，预置了 PR 自动评审 (Pull Request Review) 和 Issue 自动分类 (Issue Triage) 等场景模板。

* 对话式交互 (ChatOps)：支持在 Issue 或 PR 评论区通过 @gemini-cli 唤起，执行特定指令（如 /review, /triage）或进行自由问答（如解释代码、生成测试用例）。

* 上下文感知：支持读取仓库根目录下的 GEMINI.md 文件，允许用户定义项目特定的编码规范、架构模式或指令，使 AI 输出更符合项目风格。

* 工具链扩展：利用 Gemini 模型的 Function Calling 能力，可以调用外部工具（如 GitHub CLI gh）来执行更复杂的操作。

* 可观测性 (Observability)：集成了 OpenTelemetry，支持将 Trace、Metrics 和 Logs 发送到 Google Cloud，用于监控 Action 的运行性能和 Token 消耗。

## 实现原理

以`@gemini-cli /review`执行流程为例：

![Gemini_Generated_Image_vbul79vbul79vbul.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/eYVOL5j8WYkaJlpz/img/c1393c32-6752-449e-8aa0-fe662351c362.png)

run-gemini-cli 采用分层架构设计，从 GitHub 事件触发到最终的大模型调用，通过明确的职责划分保证了系统的灵活性和可扩展性。整体架构分为四层：

1. 事件接入层 (Event Layer)

* 触发源：监听 GitHub 平台的原生事件，包括 issue\_comment（评论创建）、pull\_request（PR 提交/更新）、issues（Issue 创建）以及 schedule（定时任务）。

* 入口：所有交互式请求首先进入统一的调度工作流（Dispatch Workflow），而非直接触发具体功能。

1. 调度分发层 (Dispatch Layer)

* 核心组件：gemini-dispatch.yml。

* 职责：充当路由器的角色。它解析用户的评论指令（如 /review, /triage）或事件类型。

* 鉴权与解析：

  * 验证触发者权限（仅允许 Owner/Member/Collaborator 触发）。

  * 使用 actions/github-script 提取指令和附带的上下文参数。

  * 根据解析结果设置 outputs，决定后续调用哪个具体的功能工作流。

1. 业务编排层 (Workflow Layer)

* 核心组件：gemini-review.yml, gemini-triage.yml 等独立的可复用工作流 (Reusable Workflows)。

* 职责：

  * 环境准备：通过 OIDC (OpenID Connect) 获取 Google Cloud 认证令牌，或读取 GitHub Secrets 中的 API Key。

  * 上下文组装：检出代码仓库 (actions/checkout)，提取 Issue/PR 的标题、描述、Diff 等信息，并将其注入到环境变量中。

  * 配置注入：定义具体的 Prompt（如 /gemini-review）和工具配置（如 GitHub MCP Server），通过 settings 参数传递给底层 Action。

1. 执行核心层 (Action Layer)

* 核心组件：action.yml (Composite Action)。

* 职责：

  * 环境初始化：验证输入参数，安装 Node.js 环境及 gemini-cli 工具。

  * 自定义命令加载：将仓库内 commands 目录下的命令定义（如 gemini-review.toml）安装到 CLI 的运行目录，这使得 CLI 能够识别 /gemini-review 等命令。

  * 配置落地：将传入的 JSON 配置写入 .gemini/settings.json，供 CLI 读取。

  * 大模型交互：执行 `gemini --yolo --prompt "${PROMPT}"` 命令。--yolo 参数确保在 CI 环境中自动确认执行，无需人工干预。

  * 结果处理：捕获 CLI 的标准输出 (stdout) 和错误输出 (stderr)，将其转换为 GitHub Action 的 outputs，并处理遥测数据 (Telemetry) 上报至 Google Cloud。

数据流：

```plaintext
GitHub 仓库配置
  ├── Variables (vars.*)       → 公开配置
  └── Secrets (secrets.*)      → 加密配置
           ↓
工作流文件 (.github/workflows/*.yml)
  使用 ${{ vars.XXX }} 或 ${{ secrets.XXX }} 引用
           ↓
通过 with: 传递给 action
           ↓
action.yml 中的 inputs: 定义接收
           ↓
在 steps 中通过 ${{ inputs.XXX }} 使用
           ↓
转换为环境变量传递给 shell 脚本
```

# 详细设计

总体思路是在 run-gemini-cli 的基础上进行改造，将 Gemini 特有的逻辑替换为 Qwen 对应的实现，其余与 CLI 无关的通用逻辑保持不变。

## 3.1 总体改动

1. workflow 文件

* Action 名称、描述、作者信息

* 输入参数（去掉 Gemini 特定的，添加 Qwen 相关的认证）

* 环境变量设置

* CLI 安装逻辑（从 Gemini CLI 改为 Qwen Code CLI）

* 认证方式（从 Google Cloud/Gemini API 改为使用 Qwen API Key）

* 所有对 @gemini-cli 的引用改为 @qwen-code

1. 提示词文件

* 提示词中的 Gemini 改为 Qwen

1. 项目文档

* README.md - 部分改写介绍和使用说明

* package.json - 名称、描述、关键词

* docs/\*.md - 部分改写认证、最佳实践等文档

* GEMINI.md - 改为 QWEN.md

1. 脚本文件

* setup\_workload\_identity.sh - 可能需要改为阿里云认证设置

* collector-gcp.yaml.template - 如果使用遥测，需要改为阿里云服务？（可以之后再加。需要做环境隔离，不能污染现有渠道的统计数据）

* generate-examples.sh - 更新相关路径和引用

## 3.2 认证

目前 run-gemini-cli 支持三种认证方式：

* Gemini API Key

* Vertex AI（类似于阿里云百炼） API Key

* 使用 Google Cloud 进行身份验证，通过 OIDC 实现

qwen-code 计划通过 API Key 进行认证，新增 OPENAI\_API\_KEY、OPENAI\_BASE\_URL 和 OPENAI\_MODEL 三个环境变量，并提供默认 endpoint 和 model。

```yaml
# action.yml 推荐配置
inputs:
  openai_api_key:
    description: 'Qwen API Key'
    required: true  # 必须由用户提供
  openai_base_url:
    description: 'Qwen API endpoint'
    required: false
    default: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  openai_model:
    description: 'Qwen model name'
    required: false
    default: 'qwen3-coder-plus'
```

![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/eYVOL5j8WYkaJlpz/img/e2b1c4b2-3d38-44b8-a716-e5e81f09ba9a.png)

# 测试方案

依赖真实仓库手动验证，或许可以先创建测试仓库，测试没问题后部署到 Qwen Code 仓库。

先在本地通过相对路径 use workflow 进行测试，没问题后 push 到仓库。

## 4.1 PR 自动评审

| 测试用例 | 测试步骤 | 预期结果 | 验证方法 |
| --- | --- | --- | --- |
| TC-PR-001: 基础评审流程 | 1. 创建 PR 添加简单代码<br>2. 触发 `gemini-review.yml` | 1. Workflow 成功运行<br>2. PR 中出现评审评论<br>3. 包含安全性、性能、可维护性反馈 | 检查 Actions 日志和 PR 评论 |
| TC-PR-002: @qwen-code /review 命令 | 1. 在 PR 评论区输入 `@qwen-code /review`<br>2. 检查 dispatch 路由 | 1. `qwen-dispatch.yml` 正确解析<br>2. 调用 `qwen-review.yml`<br>3. 生成评审结果 | 检查 dispatch 日志和评审输出 |
| TC-PR-003: 多文件 PR 评审 | 1. 创建包含 5+ 文件的 PR<br>2. 触发评审 | 1. 所有文件都被分析<br>2. 评论包含文件路径和行号<br>3. 无重复评论 | 验证评论覆盖率和准确性 |
| TC-PR-004: 代码建议格式 | 1. 提交有明显问题的代码<br>2. 触发评审 | 1. 评论包含正确的严重级别(🔴/🟠/🟡/🟢)<br>2. 代码建议使用 `suggestion` 格式<br>3. 行号和缩进准确 | 检查 suggestion block 格式 |

## 4.2 Issue 自动分类

| 测试用例 | 测试步骤 | 预期结果 | 验证方法 |
| --- | --- | --- | --- |
| TC-ISSUE-001: 新 Issue 分类 | 1. 创建包含 "bug" 关键词的 Issue<br>2. 触发 `qwen-triage.yml` | 1. 自动添加 `bug` 标签<br>2. 评论包含分类理由 | 检查 Issue 标签和评论 |
| TC-ISSUE-002: @qwen-code /triage 命令 | 1. 在 Issue 中评论 `@qwen-code /triage`<br>2. 检查处理流程 | 1. 重新分析 Issue<br>2. 更新标签或添加建议 | 验证标签变更历史 |
| TC-ISSUE-003: 定时批量分类 | 1. 配置 `qwen-scheduled-triage.yml`<br>2. 手动触发 workflow\_dispatch | 1. 批量处理未分类 Issue<br>2. 生成分类报告 | 检查 Actions 输出摘要 |

## 4.3 通用助手功能

| 测试用例 | 测试步骤 | 预期结果 | 验证方法 |
| --- | --- | --- | --- |
| TC-ASSIST-001: 自由问答 | 1. 在 Issue/PR 中评论 `@qwen-code 解释这段代码的作用`<br>2. 触发 `qwen-invoke.yml` | 1. 生成代码解释<br>2. 以评论形式回复 | 检查回复质量和准确性 |
| TC-ASSIST-002: 生成测试用例 | 1. 评论 `@qwen-code 为这个函数生成单元测试`<br>2. 检查输出 | 1. 生成可运行的测试代码<br>2. 包含边界条件测试 | 实际运行生成的测试 |
