import { describe, expect, test } from "bun:test";
import { makeRepository, runFormatter, snapshot } from "./scratch.ts";

const files = {
  "README.md": "Title\n=====\n\n* one\n",
  "good.py": "x=1\n",
  "broken.py": "def (:\n    pass\n",
  "run.sh": "if true;then\necho  hi\nfi\n",
  "data.json": '{"a":1}\n',
};

describe("M6: a syntax error in one file stops every write (L7)", () => {
  test("write exits 2 and leaves every file as it was", () => {
    const root = makeRepository(files);
    const before = snapshot(root);
    const run = runFormatter(root, ["write"]);
    expect(run.exitCode).toBe(2);
    expect(snapshot(root)).toEqual(before);
  });

  test("the report names the file, its backend and the reason", () => {
    const root = makeRepository(files);
    const run = runFormatter(root, ["write", "--json"]);
    expect(run.exitCode).toBe(2);
    const report = JSON.parse(run.stdout);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].path).toBe("broken.py");
    expect(report.failed[0].backend).toBe("ruff");
    expect(report.failed[0].message).not.toBe("");
    expect(report.changed).toEqual([
      "README.md",
      "data.json",
      "good.py",
      "run.sh",
    ]);
  });

  test("a syntax error in a shell script stops the write the same way", () => {
    const root = makeRepository({
      ...files,
      "broken.py": "pass\n",
      "broken.sh": "if then fi (\n",
    });
    const before = snapshot(root);
    const run = runFormatter(root, ["write"]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toContain("failed         1\n  broken.sh  shell: ");
    expect(snapshot(root)).toEqual(before);
  });

  test("a syntax error in a Prettier file stops the write the same way", () => {
    const root = makeRepository({
      ...files,
      "broken.py": "pass\n",
      "broken.json": '{"a": }\n',
    });
    const before = snapshot(root);
    const run = runFormatter(root, ["write"]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toContain("failed         1\n  broken.json  prettier: ");
    expect(snapshot(root)).toEqual(before);
  });
});
