import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  git,
  makeRepository,
  read,
  runFormatter,
  snapshot,
} from "./scratch.ts";

const tree = {
  "README.md": "- tidy\n",
  "fixtures/case.json": '{"a":1}\n',
};

describe("R7 (ruling 7): an ignore file that git does not track stops the run", () => {
  for (const mode of ["check", "write"]) {
    test(`${mode} exits 2 for a .formatterignore that was written and not yet added, and writes nothing`, () => {
      const root = makeRepository(tree);
      writeFileSync(join(root, ".formatterignore"), "fixtures/\n");
      const before = snapshot(root);
      const run = runFormatter(root, [mode]);
      expect(run.exitCode).toBe(2);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain(
        ".formatterignore stands at the top of the repository but git does not track it: add it with git add, or remove it",
      );
      expect(snapshot(root)).toEqual(before);
      expect(read(root, "fixtures/case.json")).toBe('{"a":1}\n');
    });
  }

  test("a .formatterignore that a .gitignore hides is refused too", () => {
    const root = makeRepository({
      ...tree,
      ".gitignore": ".formatterignore\n",
    });
    writeFileSync(join(root, ".formatterignore"), "fixtures/\n");
    expect(runFormatter(root, ["check"]).exitCode).toBe(2);
  });

  test("a link or a directory named .formatterignore is refused too", () => {
    const linked = makeRepository(tree);
    symlinkSync("README.md", join(linked, ".formatterignore"));
    expect(runFormatter(linked, ["check"]).exitCode).toBe(2);
    const directory = makeRepository(tree);
    mkdirSync(join(directory, ".formatterignore"));
    expect(runFormatter(directory, ["check"]).exitCode).toBe(2);
  });

  test("a path argument does not take the check away", () => {
    const root = makeRepository(tree);
    writeFileSync(join(root, ".formatterignore"), "fixtures/\n");
    expect(runFormatter(root, ["check", "README.md"]).exitCode).toBe(2);
  });

  test("once the file is added, it is read and the run goes on", () => {
    const root = makeRepository(tree);
    writeFileSync(join(root, ".formatterignore"), "fixtures/\n");
    git(root, ["add", ".formatterignore"]);
    const run = runFormatter(root, ["check", "--json"]);
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout).classes.ignored).toBe(1);
  });

  test("a repository with no .formatterignore at all is not refused", () => {
    expect(runFormatter(makeRepository(tree), ["check"]).exitCode).toBe(1);
  });
});
