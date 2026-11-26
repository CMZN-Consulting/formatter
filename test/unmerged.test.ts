import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  git,
  makeRepository,
  read,
  runFormatter,
  snapshot,
} from "./scratch.ts";

const identity = ["-c", "user.name=t", "-c", "user.email=t@example.com"];

function commit(root: string, message: string): void {
  git(root, [...identity, "commit", "-q", "-am", message]);
}

// A repository in the middle of a merge that conflicts in README.md.
function conflicted(): string {
  const root = makeRepository({
    "README.md": "line\n",
    "a.md": "* tidy me\n",
  });
  commit(root, "base");
  git(root, ["checkout", "-q", "-b", "other"]);
  writeFileSync(join(root, "README.md"), "other\n");
  commit(root, "other");
  git(root, ["checkout", "-q", "main"]);
  writeFileSync(join(root, "README.md"), "mine\n");
  commit(root, "mine");
  const merge = Bun.spawnSync(["git", ...identity, "merge", "other"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(merge.exitCode).toBe(1);
  return root;
}

describe("an unmerged file stops the run", () => {
  test("the scratch repository really holds a conflict marker", () => {
    expect(read(conflicted(), "README.md")).toContain(">>>>>>> other");
  });

  for (const mode of ["check", "write"]) {
    test(`${mode} exits 2 and names the unmerged file, and changes no byte`, () => {
      const root = conflicted();
      const before = snapshot(root);
      const run = runFormatter(root, [mode]);
      expect(run.exitCode).toBe(2);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("README.md: unmerged in the index");
      expect(snapshot(root)).toEqual(before);
    });
  }

  test("a path that leaves the unmerged file out of the set does not stop the run", () => {
    const root = conflicted();
    const run = runFormatter(root, ["write", "a.md"]);
    expect(run.exitCode).toBe(0);
    expect(read(root, "a.md")).toBe("- tidy me\n");
    expect(read(root, "README.md")).toContain(">>>>>>> other");
  });

  test("after the conflict is resolved and added, the run goes on", () => {
    const root = conflicted();
    writeFileSync(join(root, "README.md"), "resolved\n");
    git(root, ["add", "README.md"]);
    expect(runFormatter(root, ["check"]).exitCode).toBe(1);
  });
});
