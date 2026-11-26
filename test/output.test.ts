import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { launcher, makeRepository, scratchDirectory } from "./scratch.ts";

const tidy = { "README.md": "- one\n", "src/a.py": "x = 1\n" };
const untidy = { "README.md": "* one\n", "src/a.py": "x=1\n" };
const broken = { ...tidy, "src/b.py": "def (:\n" };

interface Outcome {
  readonly status: number;
  readonly stderr: string;
}

// Runs the launcher with its standard output sent to `sink`, and reads the exit
// status from the shell that ran it, not from a pipeline.
function statusWith(
  tree: Readonly<Record<string, string>>,
  args: readonly string[],
  sink: "pipe" | "full",
): Outcome {
  const root = makeRepository(tree);
  const marker = join(scratchDirectory(), "status");
  const script =
    sink === "pipe"
      ? '{ "$0" "$@" 2>"$ERR"; echo $? >"$STATUS"; } | true'
      : '"$0" "$@" >/dev/full 2>"$ERR"; echo $? >"$STATUS"';
  const err = `${marker}.err`;
  Bun.spawnSync(["sh", "-c", script, launcher, ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}`,
      STATUS: marker,
      ERR: err,
    },
  });
  return {
    status: Number(readFileSync(marker, "utf8").trim()),
    stderr: readFileSync(err, "utf8"),
  };
}

describe("R5 (ruling 5): the exit status does not depend on the report being printed", () => {
  const cases: readonly [
    string,
    Readonly<Record<string, string>>,
    string[],
    number,
  ][] = [
    ["check on a tree in form", tidy, ["check"], 0],
    ["check --json on a tree in form", tidy, ["check", "--json"], 0],
    ["check on a tree out of form", untidy, ["check"], 1],
    ["write that succeeded", untidy, ["write"], 0],
    ["check where a tool failed", broken, ["check"], 2],
  ];
  for (const [name, tree, args, expected] of cases) {
    test(`${name} exits ${expected} when standard output is a closed pipe`, () => {
      const outcome = statusWith(tree, args, "pipe");
      expect(outcome.status).toBe(expected);
      expect(outcome.stderr).toBe("");
    });
    test.skipIf(!existsSync("/dev/full"))(
      `${name} exits ${expected} when standard output is a full device`,
      () => {
        const outcome = statusWith(tree, args, "full");
        expect(outcome.status).toBe(expected);
        expect(outcome.stderr).toContain("the report could not be written");
        expect(outcome.stderr).not.toContain("Bun v");
      },
    );
  }
});
