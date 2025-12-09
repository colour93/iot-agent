#include <Arduino.h>
#include <WiFi.h>
#include <PsychicMqttClient.h>
#include <ArduinoJson.h>
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

// ====== 工具函数 ======
String buildTopic(const String &suffix) { return baseTopic + "/" + suffix; }

void connectWifi()
{
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  logInfo("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  logInfo("WiFi connected, IP: " + WiFi.localIP().toString());
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
  JsonObject capTemp = caps.createNestedObject();
  capTemp["kind"] = "attr";
  capTemp["name"] = "temperature";
  capTemp["schema"]["type"] = "number";

  JsonObject capHum = caps.createNestedObject();
  capHum["kind"] = "attr";
  capHum["name"] = "humidity";
  capHum["schema"]["type"] = "number";

  JsonObject capMethod = caps.createNestedObject();
  capMethod["kind"] = "method";
  capMethod["name"] = "set_led";
  capMethod["schema"]["type"] = "object";

  char buffer[512];
  size_t len = serializeJson(doc, buffer);
  mqttClient.publish(buildTopic("register").c_str(), 1, false, buffer, len);
}

void publishHeartbeat()
{
  logDebug("Publish heartbeat");
  StaticJsonDocument<256> doc;
  doc["ts"] = (long)(millis() / 1000);
  doc["status"] = "online";
  doc["meta"]["rssi"] = WiFi.RSSI();

  char buffer[256];
  size_t len = serializeJson(doc, buffer);
  mqttClient.publish(buildTopic("lwt/status").c_str(), 1, false, buffer, len);
}

void publishTelemetry()
{
  float temperature = 22.0 + ((float)random(0, 100) / 100.0); // 示例数据
  float humidity = 55.0 + ((float)random(0, 100) / 100.0);

  StaticJsonDocument<256> doc;
  doc["ts"] = (long)(millis() / 1000);
  doc["attrs"]["temperature"] = temperature;
  doc["attrs"]["humidity"] = humidity;

  char buffer[256];
  size_t len = serializeJson(doc, buffer);
  mqttClient.publish(buildTopic("telemetry").c_str(), 0, false, buffer, len);
}

void handleCommand(const String &topic, const String &payload)
{
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload))
  {
    logWarn("Invalid command json");
    return;
  }
  const char *cmdId = doc["cmdId"] | "unknown";
  const char *method = doc["method"] | "noop";

  logInfo(String("CMD ") + cmdId + ": " + method);
  // 示例：set_led 方法
  String status = "ok";
  if (String(method) == "set_led")
  {
    // 此处可操作 GPIO
    logDebug("Setting LED (simulated)");
  }

  StaticJsonDocument<256> ack;
  ack["cmdId"] = cmdId;
  ack["status"] = status;
  char buffer[256];
  size_t len = serializeJson(ack, buffer);
  mqttClient.publish(buildTopic("command/ack").c_str(), 1, false, buffer, len);
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

void connectMqtt()
{
  mqttClient.setServer(MQTT_URI);
  mqttClient.setCredentials(MQTT_USER, MQTT_PASS);
  mqttClient.setClientId((String("device/") + DEVICE_ID).c_str());
  mqttClient.setWill(buildTopic("lwt/status").c_str(), 1, true, "{\"status\":\"offline\"}");
  mqttClient.onMessage(onMessage);

  logInfo("Connecting MQTT with URI: " + String(MQTT_URI));
  if (mqttClient.connected())
  {
    logInfo("MQTT already connected");
    return;
  }
  mqttClient.disconnect();
  delay(200);
  mqttClient.connect();

  uint8_t retry = 0;
  while (!mqttClient.connected() && retry < 10)
  {
    delay(300);
    retry++;
  }
  if (mqttClient.connected())
  {
    logInfo("MQTT connected");
  }
  else
  {
    logError("MQTT connect failed");
  }

  mqttClient.subscribe(buildTopic("command").c_str(), 1);
  mqttClient.subscribe(buildTopic("register/ack").c_str(), 1);
  mqttClient.subscribe(buildTopic("config").c_str(), 1);

  publishRegister();
}

void setup()
{
  Serial.begin(115200);
  randomSeed(analogRead(0));
  baseTopic = String("device/") + DEVICE_ID;

  connectWifi();
  connectMqtt();
  publishHeartbeat();
}

void loop()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectWifi();
  }
  if (!mqttClient.connected())
  {
    connectMqtt();
  }

  unsigned long now = millis();
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
