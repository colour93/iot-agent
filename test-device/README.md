# test-device

基于 Bun 的 MQTT 设备模拟器，用于联调「设备接入、注册、心跳、遥测、事件、命令回执」全链路。

## 目标

- 支持一次启动多个虚拟设备，模拟真实接入流程。
- 配置化定义设备属性、事件、命令行为，便于扩展不同测试场景。
- 兼容当前后端主题 `device/{deviceId}`，也可切换为文档层级主题模板。

## 快速开始

```bash
# 在仓库根目录
bun run dev:test-device
```

或单独运行：

```bash
bun run --cwd test-device start -- --config ./config/devices.example.toml
```

## 常用参数

```bash
# 仅验证配置，不建立 MQTT 连接
bun run --cwd test-device start -- --dry-run

# 只运行部分设备（逗号分隔）
bun run --cwd test-device start -- --device dev-sim-1,dev-sim-2

# 运行 120 秒后自动停止
bun run --cwd test-device start -- --stop-after 120
```

## 配置文件

- 示例配置：`test-device/config/devices.example.toml`
- 支持 `.toml` 和 `.json`
- 你可以先生成一份本地配置：

```bash
bun run --cwd test-device init-config
```

关键字段说明：

- `mqtt.url/username/password`: MQTT 连接信息。
- `topic.baseTemplate`: 主题模板，默认 `device/{deviceId}`。
- `devices[*].attrs`: 属性生成规则，支持 `constant/random-int/random-float/random-walk/sequence/toggle`。
- `devices[*].events`: 事件计划，支持 `intervalSec + chance`。
- `devices[*].methods`: 命令行为定义，可设定回执状态并同步修改属性。

## 命令调试规范（method / params / apply）

### 1) MQTT 命令负载标准格式

后端会向 `device/{deviceId}/command` 发布如下结构：

```json
{
  "cmdId": "uuid",
  "method": "set_led",
  "params": {
    "on": true
  },
  "timeout": 5000
}
```

其中 `test-device` 只关注：

- `method`: 匹配 `devices[*].methods[*].name`
- `params`: 作为方法入参

### 2) `methods[*]` 字段含义

- `name`: 方法名（必填），例如 `set_led`
- `ackStatus`: 回执状态，`ok` 或 `error`，默认 `ok`
- `error`: 当 `ackStatus = "error"` 时回执的错误文本
- `result`: 回执 `result` 内容
- `apply`: 方法执行后的属性副作用规则（可选）

### 3) `apply` 写法与参数映射

`apply.type = "set-attr"`（默认）：

- 作用：把一个值写到某个属性
- 必填：`apply.attr`
- 取值优先级（推荐只依赖前两条）：
1. `params[apply.fromParam]`（完全匹配）
2. `params` 中与 `fromParam` 忽略大小写/`_`/`-` 后匹配的字段
3. `params.value[apply.fromParam]`（兼容前端调试面板）
4. `params.value` 中与 `fromParam` 忽略大小写/`_`/`-` 后匹配的字段
5. 若还未命中，会走调试回退规则（见第 4 节）

示例（推荐，接口最清晰）：

```toml
[[devices.methods]]
name = "set_led"
ackStatus = "ok"

[devices.methods.apply]
type = "set-attr"
attr = "led"
fromParam = "on"
```

对应命令：

```json
{"method":"set_led","params":{"on":true}}
```

`apply.type = "set-attr"` 固定值：

```toml
[devices.methods.apply]
type = "set-attr"
attr = "led"
value = true
```

`apply.type = "merge-attrs"`：

- 作用：将 `params` 整体合并到当前属性

```toml
[devices.methods.apply]
type = "merge-attrs"
```

对应命令：

```json
{"method":"set_light","params":{"power":true,"brightness":80}}
```

### 4) 不写 `apply` 时的调试回退规则

用于快速联调，避免每个方法都手写 `apply`：

1. 从方法名推断属性名：
- `set_led` -> `led`
- `set-led` -> `led`
- `setLed` -> `led`
2. 取值优先级：
- `params[推断属性名]`
- `params` 中“忽略大小写/`_`/`-`”后匹配的字段
- `params.value` / `params.on` / `params.state` / `params.enabled`
- 若 `params` 只有一个字段，则取该字段值

建议：正式联调仍优先写 `apply`，这样行为最可控、最易读。

### 5) 前端调试面板输入怎么对应 `params`

当前前端“下发命令”面板会把输入框内容包成 `params.value`，例如：

- 输入 `true` -> `params = { "value": true }`
- 输入 `{"on": true}` -> `params = { "value": { "on": true } }`

所以对于 `set_led + fromParam = "on"`，你有两种稳定用法：

1. 输入 `{"on": true}`（保持 `fromParam = "on"`）
2. 改配置为 `fromParam = "value"`，然后输入 `true`

### 6) 推荐模板（可直接复制）

```toml
[[devices.methods]]
name = "set_led"
ackStatus = "ok"
result = { message = "led updated by simulator" }

[devices.methods.apply]
type = "set-attr"
attr = "led"
fromParam = "on"
```

配套命令：

```json
{"method":"set_led","params":{"on":true}}
```

## 与后端联调注意

- 当前后端 `register` 要求设备先在数据库预注册，否则会拒绝注册。
- `command/ack` 会回写命令状态，因此可用本模拟器直接测试命令闭环。
