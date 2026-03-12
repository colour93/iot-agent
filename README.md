# iot-agent

统一使用 Bun 作为 JavaScript/TypeScript 工程的包管理与脚本入口。

## 环境

- Bun `>= 1.3.10`
- PlatformIO（固件构建时需要）

## 安装依赖

```bash
bun install
```

## 常用命令（根目录）

```bash
# 默认启动后端开发模式
bun run dev

# 前后端并行开发
bun run dev:all

# 前后端顺序构建
bun run build

# 前后端类型检查
bun run typecheck

# 仅前端 lint
bun run lint
```

## 子项目命令

```bash
# 仅后端
bun run dev:backend
bun run build:backend

# 仅前端
bun run dev:frontend
bun run build:frontend
```

## 固件命令

```bash
# ESP32
bun run fw:build:esp32

# ESP32-C3
bun run fw:build:esp32c3

# 串口监视
bun run fw:monitor
```
