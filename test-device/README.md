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

## 与后端联调注意

- 当前后端 `register` 要求设备先在数据库预注册，否则会拒绝注册。
- `command/ack` 会回写命令状态，因此可用本模拟器直接测试命令闭环。
