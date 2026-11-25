#!/usr/bin/env bun
import { join } from "node:path";

// Bun reads a bunfig.toml and .env files from the working directory when it
// starts. The work runs in a second process that reads neither, so the
// repository's Bun configuration cannot change a byte of the result.
const marker = "CMZN_FORMATTER_ISOLATED";
const args = process.argv.slice(2);

if (process.env[marker] === "1") {
  const { run } = await import("./main.ts");
  process.exitCode = await run(args);
} else {
  const child = Bun.spawnSync(
    [
      process.execPath,
      "--no-env-file",
      `--config=${join(import.meta.dir, "isolated.toml")}`,
      import.meta.path,
      ...args,
    ],
    {
      env: { ...process.env, [marker]: "1" },
      stdio: ["inherit", "inherit", "inherit"],
    },
  );
  process.exitCode = child.exitCode ?? 2;
}
