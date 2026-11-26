import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  launcher,
  makeRepository,
  scratchDirectory,
  runCommand,
} from "./scratch.ts";

// A path that holds Bun and the tools the launcher uses, and no git.
function pathWithoutGit(): string {
  const directory = join(scratchDirectory(), "tools");
  mkdirSync(directory);
  symlinkSync(process.execPath, join(directory, "bun"));
  for (const tool of ["dirname", "readlink"]) {
    const found = Bun.which(tool);
    expect(found).not.toBeNull();
    symlinkSync(found ?? "", join(directory, tool));
  }
  return directory;
}

describe("when git cannot be run, the message says that", () => {
  for (const mode of ["check", "write"]) {
    test(`${mode} says git could not be run, not that the directory is no repository`, () => {
      const root = makeRepository({ "a.md": "- a\n" });
      const run = runCommand([launcher], root, [mode], {
        PATH: pathWithoutGit(),
      });
      expect(run.exitCode).toBe(2);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("formatter: git could not be run");
      expect(run.stderr).not.toContain("not inside the working tree");
    });
  }
});
