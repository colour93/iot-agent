## IoT Agent 下一步落地计划（含全量 TODO）

### Progress（2026-03-15）
- Sprint 1（P0）已完成：家庭权限闭环、命令落库闭环、MQTT 事件触发自动化、NL 创建自动化、前后台模型分工、规则 schema 统一、关键观测指标。
- 前端稳定性修复：已修复登录后沿用旧 `homeId` + mock fallback 导致的 `403/404` 循环请求问题（结构与自动化接口）。

### Summary
- 目标：把“可演示系统”补齐为“需求闭环系统”，优先完成家庭隔离、自动化事件驱动、命令闭环、NL 创建自动化。
- 下一步（Sprint 1，建议 7-10 天）先交付 4 项：`homeIds` 鉴权闭环、命令落库闭环、MQTT 事件触发自动化、自然语言创建自动化（MVP）。
- 完成标准：需求文档中的核心功能需求（家庭/房间/设备、前后台模型分工、自动化独立执行、家庭上下文隔离）可端到端验收。

### 关键接口与行为变更（Public API / 类型）
- `POST /api/auth/login`：返回 `homeIds`（当前用户可访问家庭集合），不再固定空数组。
- `POST /api/devices/:deviceId/command`：改为“先落库 command 再下发 MQTT”，响应包含 `cmdId` 与初始状态。
- MQTT 入站处理：`telemetry`、`event/*` 到达后，统一构造 `triggerContext` 并触发自动化引擎（异步，不阻塞消息消费）。
- 新增 `POST /api/homes/:homeId/automations/nl`：输入自然语言，输出并保存标准 JSON 规则（`source='nl'`）。
- 自动化规则类型统一：前后端共用同一规则 schema（`conditions/actions`），禁止前端写入未定义 condition kind。

### TODO（全量，按优先级）
- [x] P0-01 鉴权闭环：登录注入 `homeIds`，所有 `homes/:homeId/*` 路由统一家庭权限校验。
- [x] P0-02 命令闭环：命令下发接口补齐落库，打通 `sent -> acked/failed/timeout -> retry` 全状态追踪。
- [x] P0-03 自动化触发闭环：MQTT `event`/`telemetry` 自动触发规则执行，不再只靠手动 `/run`。
- [x] P0-04 自然语言创建自动化：后端 NL->Rule 解析、规则校验、持久化；前端提供“NL 创建”入口。
- [x] P0-05 前后台模型分工落地：`action.kind='llm'` 真正调用后台模型（`role=back`），并与前台会话隔离。
- [x] P0-06 预设模板修正：清理无效 `condition.kind`（如前端当前 `context` 类型），保证模板可执行。
- [x] P0-07 关键可观测性：补充自动化命中率、命令成功率、LLM 调用次数/失败率指标。

- [ ] P1-01 MQTT 主题升级：从 `device/{deviceId}/...` 迁移到 `home/{homeId}/room/{roomId}/device/{deviceId}/...`，双栈兼容一阶段。
- [ ] P1-02 外部数据联动：天气/季节采集与缓存（Redis + PG cache），接入 `external` 条件判定。
- [ ] P1-03 自动化调度：支持 cron/time 条件的真实调度，不仅“time 条件默认 true”。
- [ ] P1-04 固件抽象化：设备侧建立传感器/触发器基类与派生实现，替换单文件 demo 结构。
- [ ] P1-05 家庭隔离强化：LLM、自动化、命令查询接口全面按 home 维度过滤和审计。

- [ ] P2-01 语音能力：前端语音输入（STT）+ 可选语音播报（TTS）。
- [ ] P2-02 生产安全收敛：`cors` 白名单、强 JWT secret、MQTT ACL/TLS 策略。
- [ ] P2-03 运维能力：Prometheus 指标规范化、审计日志完善、故障告警阈值配置。
- [ ] P2-04 设备可靠性：OTA、离线缓冲、本地队列与重连策略增强。

### Test Plan（验收场景）
- [ ] 鉴权测试：用户仅可访问 `homeIds` 内家庭；跨家庭请求返回 403。
- [ ] 命令链路测试：下发后可查到 command 记录；收到 ack 后状态正确更新；超时可重试且次数受限。
- [ ] 自动化测试：上报事件/遥测后自动命中规则并执行动作；未命中不触发。
- [ ] NL 自动化测试：自然语言创建出的规则可通过 schema 校验并可执行。
- [ ] 回归测试：家庭/房间/设备 CRUD、聊天控制设备、JSON 自动化编辑不退化。

### Assumptions（默认决策）
- 默认先交付文本交互闭环，语音能力放到 P2。
- MQTT 主题迁移采用“先双栈兼容、后切换”策略，避免一次性改动固件与后端。
- 自动化执行优先确定性 JSON 链路；LLM 只做规则生成和后台辅助判定，不替代确定性执行。
- 以现有技术栈不变为前提（Bun/Express/TypeORM/React/AI-SDK），不引入新框架重构。
