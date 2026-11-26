import { describe, expect, test } from "bun:test";
import { linkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  git,
  makeRepository,
  read,
  runFormatter,
  scratchDirectory,
  snapshot,
} from "./scratch.ts";

describe("a hard link is never written through", () => {
  for (const mode of ["check", "write"]) {
    test(`${mode} exits 2 and names a formatted file that has a hard link to an ignored file`, () => {
      const root = makeRepository({
        ".formatterignore": "fixtures/\n",
        "fixtures/case.json": '{"a":1}\n',
      });
      linkSync(join(root, "fixtures/case.json"), join(root, "data.json"));
      git(root, ["add", "-A"]);
      const before = snapshot(root);
      const run = runFormatter(root, [mode]);
      expect(run.exitCode).toBe(2);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("data.json: has 2 hard links on disk");
      expect(snapshot(root)).toEqual(before);
      expect(read(root, "fixtures/case.json")).toBe('{"a":1}\n');
    });

    test(`${mode} exits 2 for a formatted file linked to a file outside the repository, and that file is unchanged`, () => {
      const outside = scratchDirectory();
      writeFileSync(join(outside, "elsewhere.md"), "* outside\n");
      const root = makeRepository({ "keep.md": "- tidy\n" });
      linkSync(join(outside, "elsewhere.md"), join(root, "linked.md"));
      git(root, ["add", "-A"]);
      const run = runFormatter(root, [mode]);
      expect(run.exitCode).toBe(2);
      expect(run.stderr).toContain("linked.md: has 2 hard links on disk");
      expect(read(outside, "elsewhere.md")).toBe("* outside\n");
    });
  }

  test("a file that is not formatted may have hard links: it is never written", () => {
    const root = makeRepository({
      ".formatterignore": "fixtures/\n",
      "fixtures/case.json": '{"a":1}\n',
      "notes.typify": "kept  as   it is\n",
      "keep.md": "- tidy\n",
    });
    linkSync(
      join(root, "fixtures/case.json"),
      join(root, "fixtures/copy.json"),
    );
    linkSync(join(root, "notes.typify"), join(root, "other.typify"));
    git(root, ["add", "-A"]);
    const run = runFormatter(root, ["check"]);
    expect(run.exitCode).toBe(0);
  });
});
