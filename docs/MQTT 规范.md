# MQTT 主题与消息规范

本规范覆盖设备注册、心跳/遗嘱、遥测、事件、命令下发/回执、配置/OTA 预留以及安全策略，适用于 `home/{homeId}/room/{roomId}/device/{deviceId}` 层级。

## 客户端标识与安全
- clientId：`home/{homeId}/room/{roomId}/device/{deviceId}`
- 用户名：`{deviceId}`
- 密码：设备预注册密钥或一次性 token，注册成功后可下发长效密钥
- TLS：生产环境推荐开启；Dev 可明文
- ACL：仅允许设备访问自身命名空间 `home/{homeId}/room/{roomId}/device/{deviceId}/#`
- 遗嘱：Broker 配置遗嘱主题 `.../lwt/status`，payload `{"status":"offline","ts":<serverTs>}`

## 主题一览
- 注册上报：`.../register`（pub by device, QoS1）
- 注册应答：`.../register/ack`（pub by server, QoS1）
- 心跳/在线：`.../lwt/status`（device pub online；Broker LWT offline，QoS1）
- 遥测/属性：`.../telemetry`（device pub，QoS0/1）
- 事件：`.../event/{eventType}`（device pub，QoS1）
- 命令下发：`.../command`（server pub，QoS1）
- 命令回执：`.../command/ack`（device pub，QoS1）
- 配置更新：`.../config`（server pub，QoS1，预留）
- OTA：`.../ota`（server pub，QoS1，预留）

## 消息格式（JSON，UTF-8，均包含 `ts`）
- 注册上报
```json
{
  "ts": 1700000000,
  "deviceId": "dev-1",
  "homeId": "home-1",
  "roomId": "room-1",
  "type": "sensor|actuator|both",
  "name": "temp node",
  "fw": "1.0.0",
  "capabilities": [
    {"kind": "attr", "name": "temperature", "unit": "C", "schema": {"type": "number"}},
    {"kind": "method", "name": "set_ac", "schema": {"type": "object", "properties": {"mode": {"type": "string"}, "temp": {"type": "number"}}}},
    {"kind": "event", "name": "motion", "schema": {"type": "object", "properties": {"strength": {"type": "number"}}}}
  ],
  "meta": {"chip": "esp32", "mac": "xx:xx"}
}
```
- 注册应答
```json
{"status":"ok","heartbeat":30,"expectAttrs":["temperature","humidity"],"serverTs":1700000000,"config":{"telemetryInterval":60}}
```
- 心跳/在线
```json
{"ts":1700000000,"status":"online","meta":{"fw":"1.0.0","battery":92}}
```
- 遥测/属性上报
```json
{"ts":1700000000,"attrs":{"temperature":23.5,"humidity":58},"meta":{"fw":"1.0.3","battery":92}}
```
- 事件
```json
{"ts":1700000000,"event":"motion","params":{"strength":0.8}}
```
- 命令下发
```json
{"cmdId":"uuid","method":"set_ac","params":{"mode":"cool","temp":25},"timeout":5000}
```
- 命令回执
```json
{"cmdId":"uuid","status":"ok","result":{"temp":25}}
```
- 配置/OTA 预留
```json
{"ts":1700000000,"kind":"config","payload":{"telemetryInterval":120}}
```

## 质量与节流
- 注册/命令/事件使用 QoS1；高频遥测可 QoS0
- 设备侧需指数退避重连；上报失败可本地短暂队列缓存
- 后端对后台模型调用需按家庭/设备节流，Redis 计数

## 状态机（概要）
1) 设备连接 MQTT（携带 clientId/user/pass）
2) 发布 `register`，等待 `register/ack`
3) 周期心跳 `lwt/status`，Broker LWT 标记 offline
4) 遥测/事件按策略上报
5) 订阅 `command`，执行后回执 `command/ack`
6) 预留 `config/ota` 更新

