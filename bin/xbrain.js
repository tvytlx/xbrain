#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDir, "..");

async function main() {
  const runtimeDir = await mkdtemp(resolve(tmpdir(), "xbrain-runtime-"));
  const runtimeRoot = resolve(runtimeDir, "app");
  const runtimeSrc = resolve(runtimeRoot, "src");
  const runtimeNodeModules = resolve(runtimeRoot, "node_modules");
  const entry = resolve(runtimeSrc, "index.ts");

  await cp(resolve(packageRoot, "src"), runtimeSrc, { recursive: true });
  await symlink(resolve(packageRoot, "node_modules"), runtimeNodeModules, "dir");

  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", entry, ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );

  child.on("error", async (error) => {
    console.error(error.message);
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
    process.exit(1);
  });

  child.on("exit", async (code, signal) => {
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
