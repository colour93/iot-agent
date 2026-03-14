#include "device_components.h"

void SensorBase::appendCapability(JsonArray caps) const {
  JsonObject cap = caps.createNestedObject();
  cap["kind"] = "attr";
  cap["name"] = name();
  cap["schema"]["type"] = "number";
}

void SensorBase::appendTelemetry(JsonObject attrs) {
  attrs[name()] = readValue();
}

void TriggerBase::appendCapability(JsonArray caps) const {
  JsonObject cap = caps.createNestedObject();
  cap["kind"] = "method";
  cap["name"] = methodName();
  cap["schema"]["type"] = "object";
}

const char *TemperatureSensor::name() const {
  return "temperature";
}

float TemperatureSensor::readValue() {
  return 22.0f + (static_cast<float>(random(0, 100)) / 100.0f);
}

const char *HumiditySensor::name() const {
  return "humidity";
}

float HumiditySensor::readValue() {
  return 55.0f + (static_cast<float>(random(0, 100)) / 100.0f);
}

LedTrigger::LedTrigger(uint8_t pin) : _pin(pin) {
  pinMode(_pin, OUTPUT);
}

const char *LedTrigger::methodName() const {
  return "set_led";
}

bool LedTrigger::execute(const JsonVariantConst &params) {
  const bool turnOn = params["on"] | true;
  digitalWrite(_pin, turnOn ? HIGH : LOW);
  return true;
}
