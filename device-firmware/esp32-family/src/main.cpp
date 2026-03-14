#include <Arduino.h>
#include <WiFi.h>
#include <PsychicMqttClient.h>
#include <ArduinoJson.h>
#include "device_components.h"
#include "../include/consts.h"

// ====== 日志封装 ======
void logInfo(const String &msg) { Serial.printf("[INFO] %s\n", msg.c_str()); }
void logWarn(const String &msg) { Serial.printf("[WARN] %s\n", msg.c_str()); }
void logError(const String &msg) { Serial.printf("[ERROR] %s\n", msg.c_str()); }
void logDebug(const String &msg) { Serial.printf("[DEBUG] %s\n", msg.c_str()); }

// ====== 全局状态 ======
PsychicMqttClient mqttClient;
String baseTopic;
unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;
TemperatureSensor temperatureSensor;
HumiditySensor humiditySensor;
LedTrigger ledTrigger;
SensorBase *sensors[] = {&temperatureSensor, &humiditySensor};
TriggerBase *triggers[] = {&ledTrigger};
constexpr size_t SENSOR_COUNT = sizeof(sensors) / sizeof(sensors[0]);
constexpr size_t TRIGGER_COUNT = sizeof(triggers) / sizeof(triggers[0]);

struct OutboxMessage
{
  String topic;
  String payload;
  uint8_t qos;
  bool retain;
};

constexpr size_t OUTBOX_CAPACITY = 24;
constexpr unsigned long RETRY_BACKOFF_MIN_MS = 1000;
constexpr unsigned long RETRY_BACKOFF_MAX_MS = 30000;
OutboxMessage outbox[OUTBOX_CAPACITY];
size_t outboxHead = 0;
size_t outboxTail = 0;
size_t outboxCount = 0;
unsigned long nextWifiRetryMs = 0;
unsigned long nextMqttRetryMs = 0;
unsigned long wifiBackoffMs = RETRY_BACKOFF_MIN_MS;
unsigned long mqttBackoffMs = RETRY_BACKOFF_MIN_MS;

// ====== 工具函数 ======
String buildTopic(const String &suffix) { return baseTopic + "/" + suffix; }

unsigned long growBackoff(unsigned long current)
{
  if (current >= RETRY_BACKOFF_MAX_MS)
  {
    return RETRY_BACKOFF_MAX_MS;
  }
  unsigned long doubled = current * 2;
  if (doubled > RETRY_BACKOFF_MAX_MS)
  {
    return RETRY_BACKOFF_MAX_MS;
  }
  return doubled;
}

void enqueueOutbox(const String &topic, const String &payload, uint8_t qos, bool retain)
{
  if (outboxCount >= OUTBOX_CAPACITY)
  {
    logWarn("Outbox full, drop oldest message");
    outboxHead = (outboxHead + 1) % OUTBOX_CAPACITY;
    outboxCount--;
  }
  outbox[outboxTail] = {topic, payload, qos, retain};
  outboxTail = (outboxTail + 1) % OUTBOX_CAPACITY;
  outboxCount++;
}

void publishOrQueue(const String &topic, const String &payload, uint8_t qos, bool retain)
{
  if (mqttClient.connected())
  {
    mqttClient.publish(topic.c_str(), qos, retain, payload.c_str());
    return;
  }
  enqueueOutbox(topic, payload, qos, retain);
}

void flushOutbox(size_t maxBatch = 8)
{
  if (!mqttClient.connected() || outboxCount == 0)
  {
    return;
  }
  size_t sent = 0;
  while (outboxCount > 0 && sent < maxBatch)
  {
    const OutboxMessage &msg = outbox[outboxHead];
    mqttClient.publish(msg.topic.c_str(), msg.qos, msg.retain, msg.payload.c_str());
    outboxHead = (outboxHead + 1) % OUTBOX_CAPACITY;
    outboxCount--;
    sent++;
  }
  if (sent > 0)
  {
    logDebug(String("Flushed outbox count=") + sent);
  }
}

bool connectWifi(unsigned long now)
{
  if (WiFi.status() == WL_CONNECTED)
  {
    return true;
  }
  if (now < nextWifiRetryMs)
  {
    return false;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  logInfo("Connecting WiFi");
  const unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 8000)
  {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    wifiBackoffMs = RETRY_BACKOFF_MIN_MS;
    nextWifiRetryMs = 0;
    logInfo("WiFi connected, IP: " + WiFi.localIP().toString());
    return true;
  }

  logWarn(String("WiFi connect failed, retry in ") + wifiBackoffMs + "ms");
  nextWifiRetryMs = now + wifiBackoffMs;
  wifiBackoffMs = growBackoff(wifiBackoffMs);
  return false;
}

void publishRegister()
{
  logDebug("Publish register");
  StaticJsonDocument<512> doc;
  doc["ts"] = (long)(millis() / 1000);
  doc["deviceId"] = DEVICE_ID;
  doc["type"] = "both";
  doc["name"] = DEVICE_NAME;
  doc["fw"] = "1.0.0";

  JsonArray caps = doc.createNestedArray("capabilities");
  for (size_t i = 0; i < SENSOR_COUNT; i++)
  {
    sensors[i]->appendCapability(caps);
  }
  for (size_t i = 0; i < TRIGGER_COUNT; i++)
  {
    triggers[i]->appendCapability(caps);
  }

  String payload;
  serializeJson(doc, payload);
  publishOrQueue(buildTopic("register"), payload, 1, false);
}

void publishHeartbeat()
{
  logDebug("Publish heartbeat");
  StaticJsonDocument<256> doc;
  doc["ts"] = (long)(millis() / 1000);
  doc["status"] = "online";
  doc["meta"]["rssi"] = WiFi.RSSI();

  String payload;
  serializeJson(doc, payload);
  publishOrQueue(buildTopic("lwt/status"), payload, 1, false);
}

void publishTelemetry()
{
  StaticJsonDocument<256> doc;
  doc["ts"] = (long)(millis() / 1000);
  JsonObject attrs = doc["attrs"].to<JsonObject>();
  for (size_t i = 0; i < SENSOR_COUNT; i++)
  {
    sensors[i]->appendTelemetry(attrs);
  }

  String payload;
  serializeJson(doc, payload);
  publishOrQueue(buildTopic("telemetry"), payload, 0, false);
}

void handleCommand(const String &topic, const String &payload)
{
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload))
  {
    logWarn("Invalid command json");
    return;
  }
  const char *cmdId = doc["cmdId"] | "unknown";
  const char *method = doc["method"] | "noop";
  JsonVariantConst params = doc["params"].as<JsonVariantConst>();

  logInfo(String("CMD ") + cmdId + ": " + method);
  bool handled = false;
  bool success = false;
  for (size_t i = 0; i < TRIGGER_COUNT; i++)
  {
    if (String(method) == String(triggers[i]->methodName()))
    {
      handled = true;
      success = triggers[i]->execute(params);
      break;
    }
  }
  String status = "ok";
  if (!handled)
  {
    status = "unsupported_method";
    logWarn(String("Unsupported method: ") + method);
  }
  else if (!success)
  {
    status = "failed";
    logWarn(String("Command execute failed: ") + method);
  }

  StaticJsonDocument<256> ack;
  ack["cmdId"] = cmdId;
  ack["status"] = status;
  if (status != "ok")
  {
    ack["error"] = status;
  }
  String payloadText;
  serializeJson(ack, payloadText);
  publishOrQueue(buildTopic("command/ack"), payloadText, 1, false);
}

void onMessage(char *topic, char *payload, int retain, int qos, bool dup)
{
  String topicStr(topic);
  String data(payload);
  logDebug(String("MQTT recv topic=") + topicStr + " payload=" + data);
  if (topicStr.endsWith("/command"))
  {
    handleCommand(topicStr, data);
  }
  else if (topicStr.endsWith("/register/ack"))
  {
    Serial.printf("Register ack: %s\n", data.c_str());
  }
  else if (topicStr.endsWith("/config"))
  {
    Serial.printf("Config update: %s\n", data.c_str());
  }
}

void configureMqttClient()
{
  mqttClient.setServer(MQTT_URI);
  mqttClient.setCredentials(MQTT_USER, MQTT_PASS);
  mqttClient.setClientId((String("device/") + DEVICE_ID).c_str());
  mqttClient.setWill(buildTopic("lwt/status").c_str(), 1, true, "{\"status\":\"offline\"}");
  mqttClient.onMessage(onMessage);
}

bool connectMqtt(unsigned long now)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    return false;
  }
  if (mqttClient.connected())
  {
    return true;
  }
  if (now < nextMqttRetryMs)
  {
    return false;
  }

  configureMqttClient();
  logInfo("Connecting MQTT with URI: " + String(MQTT_URI));
  mqttClient.disconnect();
  delay(150);
  mqttClient.connect();

  uint8_t retry = 0;
  while (!mqttClient.connected() && retry < 15)
  {
    delay(200);
    retry++;
  }
  if (mqttClient.connected())
  {
    mqttBackoffMs = RETRY_BACKOFF_MIN_MS;
    nextMqttRetryMs = 0;
    logInfo("MQTT connected");
    mqttClient.subscribe(buildTopic("command").c_str(), 1);
    mqttClient.subscribe(buildTopic("register/ack").c_str(), 1);
    mqttClient.subscribe(buildTopic("config").c_str(), 1);
    publishRegister();
    flushOutbox();
    return true;
  }
  logWarn(String("MQTT connect failed, retry in ") + mqttBackoffMs + "ms");
  nextMqttRetryMs = now + mqttBackoffMs;
  mqttBackoffMs = growBackoff(mqttBackoffMs);
  return false;
}

void setup()
{
  Serial.begin(115200);
  randomSeed(analogRead(0));
  baseTopic = String("device/") + DEVICE_ID;

  connectWifi(millis());
  connectMqtt(millis());
  publishHeartbeat();
}

void loop()
{
  unsigned long now = millis();
  bool wifiReady = connectWifi(now);
  bool mqttReady = wifiReady && connectMqtt(now);

  if (mqttReady)
  {
    flushOutbox();
  }

  if (now - lastTelemetryMs > TELEMETRY_INTERVAL_S * 1000)
  {
    publishTelemetry();
    lastTelemetryMs = now;
  }
  if (now - lastHeartbeatMs > HEARTBEAT_INTERVAL_S * 1000)
  {
    publishHeartbeat();
    lastHeartbeatMs = now;
  }
}
