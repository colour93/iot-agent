#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

class SensorBase {
public:
  virtual ~SensorBase() = default;
  virtual const char *name() const = 0;
  virtual float readValue() = 0;

  void appendCapability(JsonArray caps) const;
  void appendTelemetry(JsonObject attrs);
};

class TriggerBase {
public:
  virtual ~TriggerBase() = default;
  virtual const char *methodName() const = 0;
  virtual bool execute(const JsonVariantConst &params) = 0;

  void appendCapability(JsonArray caps) const;
};

class TemperatureSensor final : public SensorBase {
public:
  const char *name() const override;
  float readValue() override;
};

class HumiditySensor final : public SensorBase {
public:
  const char *name() const override;
  float readValue() override;
};

class LedTrigger final : public TriggerBase {
public:
  explicit LedTrigger(uint8_t pin = LED_BUILTIN);

  const char *methodName() const override;
  bool execute(const JsonVariantConst &params) override;

private:
  uint8_t _pin;
};
