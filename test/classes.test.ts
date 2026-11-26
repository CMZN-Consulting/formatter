import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { classNames, type ClassName } from "../src/classes.ts";
import { makePlan } from "../src/plan.ts";
import { git, makeRepository, read, runFormatter } from "./scratch.ts";

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]);

const tree = {
  "README.md": "# Tool\n\nIt works.\n",
  "tool.py": "x = 1\n",
  "run.sh": "echo hi\n",
  "catalog.typify": "catalog\n",
  LICENSE: "Some licence.\n",
  ".formatterignore": "fixtures/\n",
  "fixtures/case.json": '{ "a":1 }\n',
  "bun.lock": "{}\n",
  "lean/lake-manifest.json": "{}\n",
  "image.png": png,
  "notes.txt": latin1,
  "readme-link.md": { link: "README.md" },
};

const expected: Readonly<Record<string, ClassName>> = {
  "README.md": "formatted",
  "tool.py": "formatted",
  "run.sh": "formatted",
  "catalog.typify": "unformatted",
  LICENSE: "unformatted",
  ".formatterignore": "unformatted",
  "fixtures/case.json": "ignored",
  "bun.lock": "tool-written",
  "lean/lake-manifest.json": "tool-written",
  "image.png": "binary",
  "notes.txt": "binary",
  "readme-link.md": "link",
  "vendor/library": "link",
};

function repository(): string {
  const root = makeRepository(tree);
  const commit = "0123456789abcdef0123456789abcdef01234567";
  git(root, [
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${commit},vendor/library`,
  ]);
  return root;
}

describe("every tracked file lands in exactly one class", () => {
  test("each file is in its class", async () => {
    const plan = await makePlan(repository(), []);
    const classes = Object.fromEntries(
      plan.files.map((file) => [file.path, file.className]),
    );
    expect(classes).toEqual(expected);
  });

  test("the formatted files name their backend", async () => {
    const plan = await makePlan(repository(), []);
    const named = plan.files
      .filter((file) => file.className === "formatted")
      .map((file) => [file.path, file.backend]);
    expect(named).toEqual([
      ["README.md", "prettier"],
      ["run.sh", "shell"],
      ["tool.py", "ruff"],
    ]);
  });

  test("the first class that applies decides", async () => {
    const root = makeRepository({
      ".formatterignore": "ignored-*\n",
      "README.md": "# Read me\n",
      "ignored-link.md": { link: "README.md" },
      "ignored-bun.lock/x": "x\n",
      "deep/bun.lock": "{}\n",
      "deep/ignored-bun.lock": "{}\n",
      "Cargo.lock": png,
      "data.json": png,
      "bun.lockb": { link: "README.md" },
    });
    const plan = await makePlan(root, []);
    const classes = Object.fromEntries(
      plan.files.map((file) => [file.path, file.className]),
    );
    expect(classes).toEqual({
      ".formatterignore": "unformatted",
      "README.md": "formatted",
      "ignored-link.md": "link",
      "ignored-bun.lock/x": "ignored",
      "deep/bun.lock": "tool-written",
      "deep/ignored-bun.lock": "ignored",
      "Cargo.lock": "tool-written",
      "data.json": "binary",
      "bun.lockb": "link",
    });
  });

  test("the class counts add up to the count of the set", () => {
    const root = repository();
    const run = runFormatter(root, ["check", "--json"]);
    expect(run.exitCode).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(Object.keys(report.classes)).toEqual([...classNames]);
    expect(report.classes).toEqual({
      link: 2,
      ignored: 1,
      "tool-written": 2,
      binary: 2,
      formatted: 3,
      unformatted: 3,
    });
    const tracked = git(root, ["ls-files", "-z"])
      .split("\0")
      .filter((path) => path !== "");
    const total = Object.values(
      report.classes as Record<string, number>,
    ).reduce((a, b) => a + b);
    expect(total).toBe(tracked.length);
    expect(report.unformatted).toEqual({
      "(none)": 1,
      ".formatterignore": 1,
      ".typify": 1,
    });
  });

  test("the text report has one line per class and per extension", () => {
    const run = runFormatter(repository(), ["check"]);
    expect(run.stdout).toBe(
      [
        "formatted      3",
        "unformatted    3",
        "  (none)            1",
        "  .formatterignore  1",
        "  .typify           1",
        "tool-written   2",
        "binary         2",
        "ignored        1",
        "link           2",
        "would change   0",
        "",
      ].join("\n"),
    );
  });

  test("an untracked file is never read and never written", () => {
    const root = repository();
    const run = runFormatter(root, ["write", "--json"]);
    expect(run.exitCode).toBe(0);
    const before = JSON.parse(run.stdout).classes;
    writeFileSync(join(root, "untracked.py"), "x=1\n");
    const after = runFormatter(root, ["write", "--json"]);
    expect(JSON.parse(after.stdout).classes).toEqual(before);
    expect(read(root, "untracked.py")).toBe("x=1\n");
  });
});
