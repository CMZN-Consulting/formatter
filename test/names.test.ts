import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepository, read, runFormatter, snapshot } from "./scratch.ts";

describe("a name that starts with U+FEFF keeps it", () => {
  test("write formats the tracked name and never reads the untracked name without it", () => {
    const root = makeRepository({ "﻿a.md": "* tracked\n" });
    writeFileSync(join(root, "a.md"), "* untracked\n");
    const run = runFormatter(root, ["write"]);
    expect(run.exitCode).toBe(0);
    expect(read(root, "﻿a.md")).toBe("- tracked\n");
    expect(read(root, "a.md")).toBe("* untracked\n");
  });

  test("check reports the name with the character, and changes nothing", () => {
    const root = makeRepository({ "﻿a.md": "* tracked\n" });
    writeFileSync(join(root, "a.md"), "* untracked\n");
    const before = snapshot(root);
    const run = runFormatter(root, ["check", "--json"]);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stdout).changed).toEqual(["﻿a.md"]);
    expect(snapshot(root)).toEqual(before);
  });

  test("a BOM inside a directory name is kept as well", () => {
    const root = makeRepository({ "﻿docs/a.md": "* tracked\n" });
    writeFileSync(join(root, "a.md"), "* untracked\n");
    expect(runFormatter(root, ["write"]).exitCode).toBe(0);
    expect(read(root, "﻿docs/a.md")).toBe("- tracked\n");
    expect(read(root, "a.md")).toBe("* untracked\n");
  });
});
