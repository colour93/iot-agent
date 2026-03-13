import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const source = resolve("./config/devices.example.toml");
  const target = resolve("./config/devices.local.toml");

  await copyFile(source, target);

  console.log(`Created config: ${target}`);
}

main().catch((err) => {
  console.error("[test-device] init-config failed", err);
  process.exit(1);
});
