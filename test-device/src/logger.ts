export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly level: LogLevel) {}

  debug(message: string, details?: unknown) {
    this.log("debug", message, details);
  }

  info(message: string, details?: unknown) {
    this.log("info", message, details);
  }

  warn(message: string, details?: unknown) {
    this.log("warn", message, details);
  }

  error(message: string, details?: unknown) {
    this.log("error", message, details);
  }

  async close() {
    return;
  }

  private log(level: LogLevel, message: string, details?: unknown) {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const ts = new Date().toISOString();
    const detailPart =
      typeof details === "undefined"
        ? ""
        : ` ${safeStringify(details)}`;
    const line = `[${ts}] [${level.toUpperCase()}] ${message}${detailPart}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

  }
}

function safeStringify(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
