import { describe, expect, test } from "bun:test";
import { chmodSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  git,
  makeRepository,
  read,
  runFormatter,
  scratchDirectory,
  snapshot,
} from "./scratch.ts";

describe("nothing outside the set is read or written (L6)", () => {
  test("a tracked file behind a directory that became a link is refused", () => {
    const outside = scratchDirectory();
    writeFileSync(join(outside, "a.md"), "* outside\n");
    const root = makeRepository({ "docs/a.md": "* inside\n" });
    rmSync(join(root, "docs"), { recursive: true });
    symlinkSync(outside, join(root, "docs"));
    const run = runFormatter(root, ["write"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("docs/a.md: on disk, docs is not a directory");
    expect(read(outside, "a.md")).toBe("* outside\n");
  });

  test("a .formatterignore tracked as a link is refused, not followed", () => {
    const outside = scratchDirectory();
    writeFileSync(join(outside, "patterns"), "README.md\n");
    const root = makeRepository({
      "README.md": "* a\n",
      ".formatterignore": { link: join(outside, "patterns") },
    });
    const run = runFormatter(root, ["check"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain(".formatterignore is tracked as a link");
  });

  test("a .formatterignore that is not a regular file on disk is refused", () => {
    const root = makeRepository({ "a.md": "* a\n", ".formatterignore": "x\n" });
    rmSync(join(root, ".formatterignore"));
    Bun.spawnSync(["mkfifo", join(root, ".formatterignore")]);
    const run = runFormatter(root, ["check"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("not a regular file on disk");
  });

  test("a name that is not valid UTF-8 is refused unless it is ignored", () => {
    const name = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x6d, 0x64]);
    const root = makeRepository({ "README.md": "# Read me\n" });
    writeFileSync(
      Buffer.from(`${root}/${name.toString("latin1")}`, "latin1"),
      "- a\n",
    );
    git(root, ["add", "-A"]);
    writeFileSync(join(root, "caf�.md"), "* untracked\n");
    const refused = runFormatter(root, ["write"]);
    expect(refused.exitCode).toBe(2);
    expect(refused.stderr).toContain(
      "caf\\xe9.md: the name is not valid UTF-8",
    );
    expect(read(root, "caf�.md")).toBe("* untracked\n");
    writeFileSync(join(root, ".formatterignore"), "caf*\n");
    git(root, ["add", ".formatterignore"]);
    const ignored = runFormatter(root, ["write", "--json"]);
    expect(ignored.exitCode).toBe(0);
    expect(JSON.parse(ignored.stdout).classes.ignored).toBe(1);
    expect(read(root, "caf�.md")).toBe("* untracked\n");
  });
});

describe("the text report", () => {
  test("quotes a path that holds a line break", () => {
    const root = makeRepository({ "x\nfailed         1\n  y.md": "* a\n" });
    const run = runFormatter(root, ["check"]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toBe(
      'formatted      1\nwould change   1\n  "x\\nfailed         1\\n  y.md"\n',
    );
  });
});

describe("write", () => {
  test.skipIf(process.getuid?.() === 0)(
    "writes nothing when a file it would change is not writable",
    () => {
      const root = makeRepository({ "a.md": "* a\n", "b.md": "* b\n" });
      chmodSync(join(root, "b.md"), 0o444);
      const before = snapshot(root);
      const run = runFormatter(root, ["write"]);
      expect(run.exitCode).toBe(2);
      expect(run.stderr).toContain("b.md: not writable");
      expect(snapshot(root)).toEqual(before);
    },
  );
});
