import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeRepository,
  read,
  runFormatter,
  scratchDirectory,
  snapshot,
} from "./scratch.ts";

const untidy = {
  "README.md": "Title\n=====\n\n* one\n* two\n",
  "src/tool.py": "def f(a,b):\n  return a+b\n",
  "src/run.sh": "if true;then\necho  hi\nfi\n",
  "src/data.json": '{"a":1,"b":[1,2]}\n',
  "notes.typify": "kept  as   it is\n",
};

const tidy = {
  "README.md": "Title\n=====\n\n- one\n- two\n",
  "src/tool.py": "def f(a, b):\n    return a + b\n",
  "src/run.sh": "if true; then\n  echo hi\nfi\n",
  "src/data.json": '{ "a": 1, "b": [1, 2] }\n',
  "notes.typify": "kept  as   it is\n",
};

describe("the exits 0, 1 and 2", () => {
  test("check exits 1 when a file would change, and changes no byte", () => {
    const root = makeRepository(untidy);
    const before = snapshot(root);
    const run = runFormatter(root, ["check"]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain(
      "would change   4\n  README.md\n  src/data.json\n  src/run.sh\n  src/tool.py\n",
    );
    expect(snapshot(root)).toEqual(before);
  });

  test("write exits 0, and check after write exits 0", () => {
    const root = makeRepository(untidy);
    const write = runFormatter(root, ["write"]);
    expect(write.exitCode).toBe(0);
    expect(write.stdout).toContain("changed        4\n");
    for (const [path, text] of Object.entries(tidy)) {
      expect(read(root, path)).toBe(text);
    }
    const check = runFormatter(root, ["check"]);
    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain("would change   0\n");
  });

  test("write on a tidy tree exits 0 and changes no byte", () => {
    const root = makeRepository(tidy);
    const before = snapshot(root);
    expect(runFormatter(root, ["write"]).exitCode).toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  test("check exits 2 when a backend fails, and changes no byte", () => {
    const root = makeRepository({ ...untidy, "src/broken.py": "def (:\n" });
    const before = snapshot(root);
    const run = runFormatter(root, ["check"]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toContain("failed         1\n  src/broken.py  ruff: ");
    expect(snapshot(root)).toEqual(before);
  });

  test("the command exits 2 outside a git repository", () => {
    const directory = scratchDirectory();
    const ceiling = realpathSync(tmpdir());
    const run = runFormatter(directory, ["check"], {
      GIT_CEILING_DIRECTORIES: ceiling,
    });
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain(
      "not inside the working tree of a git repository",
    );
  });

  test("the command exits 2 on a path that matches no tracked file", () => {
    const run = runFormatter(makeRepository(tidy), ["check", "missing"]);
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("missing");
  });

  test("the command exits 2 on unknown words", () => {
    const root = makeRepository(tidy);
    for (const args of [[], ["format"], ["check", "--tab-width=8"]]) {
      const run = runFormatter(root, args);
      expect(run.exitCode).toBe(2);
      expect(run.stderr).toStartWith("usage: formatter check");
    }
  });
});

describe("paths narrow the set", () => {
  test("only files at or below the given paths are read and written", () => {
    const root = makeRepository(untidy);
    const run = runFormatter(root, ["write", "src/tool.py", "src/run.sh"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe(
      "formatted      2\nchanged        2\n  src/run.sh\n  src/tool.py\n",
    );
    expect(read(root, "README.md")).toBe(untidy["README.md"]);
    expect(read(root, "src/data.json")).toBe(untidy["src/data.json"]);
  });

  test("a path is taken from the working directory, and the report names paths from the root", () => {
    const root = makeRepository(untidy);
    mkdirSync(join(root, "src", "empty"), { recursive: true });
    const run = runFormatter(join(root, "src"), ["check", "."]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toBe(
      "formatted      3\nwould change   3\n  src/data.json\n  src/run.sh\n  src/tool.py\n",
    );
  });

  test("a glob character in a path is taken literally", () => {
    const run = runFormatter(makeRepository(untidy), ["check", "src/*.py"]);
    expect(run.exitCode).toBe(2);
  });
});
