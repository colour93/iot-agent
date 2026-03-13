import { loadConfig } from "./config";
import { Logger, type LogLevel } from "./logger";
import { DeviceSimulator } from "./simulator";

interface CliOptions {
  configPath: string;
  selectedDeviceIds: Set<string>;
  dryRun: boolean;
  overrideShutdownAfterSec?: number;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const loaded = await loadConfig(options.configPath);

  if (typeof options.overrideShutdownAfterSec === "number") {
    loaded.simulator.shutdownAfterSec = options.overrideShutdownAfterSec;
  }

  const devices =
    options.selectedDeviceIds.size === 0
      ? loaded.devices
      : loaded.devices.filter((device) => options.selectedDeviceIds.has(device.deviceId));

  if (devices.length === 0) {
    throw new Error("No matched devices in config. Check --device values.");
  }

  const logger = new Logger(loaded.simulator.logLevel as LogLevel);

  if (options.dryRun) {
    logger.info("dry run mode - no mqtt connection", {
      configPath: loaded.configPath,
      mqtt: loaded.mqtt,
      topic: loaded.topic,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        topicBaseTemplate: d.topicBaseTemplate ?? loaded.topic.baseTemplate,
        telemetryIntervalSec: d.telemetryIntervalSec,
        heartbeatIntervalSec: d.heartbeatIntervalSec,
        events: d.events.length,
        methods: d.methods.map((m) => m.name),
      })),
    });
    await logger.close();
    return;
  }

  logger.info("starting bun test-device simulator", {
    configPath: loaded.configPath,
    devices: devices.map((d) => d.deviceId),
  });

  const simulators = devices.map((device) => new DeviceSimulator(loaded, device, logger));

  for (let i = 0; i < simulators.length; i += 1) {
    const simulator = simulators[i];
    const device = devices[i];
    if (device.startupDelayMs > 0) {
      await sleep(device.startupDelayMs);
    }
    await simulator.start();
  }

  let stopped = false;
  const shutdown = async (reason: string) => {
    if (stopped) {
      return;
    }
    stopped = true;
    logger.warn(`shutting down simulators`, { reason });
    await Promise.all(simulators.map((sim) => sim.stop()));
    await logger.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  if (loaded.simulator.shutdownAfterSec > 0) {
    setTimeout(() => {
      void shutdown(`timeout:${loaded.simulator.shutdownAfterSec}s`);
    }, loaded.simulator.shutdownAfterSec * 1000);
  }
}

function parseCliOptions(args: string[]): CliOptions {
  let configPath = "./config/devices.example.toml";
  let dryRun = false;
  let overrideShutdownAfterSec: number | undefined;
  const selectedDeviceIds = new Set<string>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--config") {
      configPath = mustReadNextValue(args, ++i, "--config");
      continue;
    }
    if (arg === "--device") {
      const raw = mustReadNextValue(args, ++i, "--device");
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((deviceId) => selectedDeviceIds.add(deviceId));
      continue;
    }
    if (arg === "--stop-after") {
      const raw = mustReadNextValue(args, ++i, "--stop-after");
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --stop-after value: ${raw}`);
      }
      overrideShutdownAfterSec = Math.floor(parsed);
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    throw new Error(`Unknown option: ${arg}. Use --help for usage.`);
  }

  return {
    configPath,
    selectedDeviceIds,
    dryRun,
    overrideShutdownAfterSec,
  };
}

function mustReadNextValue(args: string[], index: number, key: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${key}`);
  }
  return value;
}

function printHelpAndExit(): never {
  console.log(`Usage:
  bun run src/index.ts [options]

Options:
  --config <path>      Config file path (.toml or .json)
  --device <ids>       Device ID list split by comma
  --stop-after <sec>   Auto stop after N seconds
  --dry-run            Parse config and print runtime plan only
  --help, -h           Show this message
`);
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((err) => {
  console.error("[test-device] fatal error", err);
  process.exit(1);
});
