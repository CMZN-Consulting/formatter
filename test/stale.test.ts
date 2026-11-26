import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makePlan } from "../src/plan.ts";
import { writeChanges } from "../src/write.ts";
import { launcher, makeRepository, read, snapshot } from "./scratch.ts";

const untidy = {
  "README.md": "Title\n=====\n\n* one\n* two\n",
  "src/tool.py": "def f(a,b):\n  return a+b\n",
  "src/run.sh": "if true;then\necho  hi\nfi\n",
};

describe("R2 (ruling 2): nothing is written over newer bytes", () => {
  test("a target edited after it was read stops the write, and no file is written", async () => {
    const root = makeRepository(untidy);
    const plan = await makePlan(root, []);
    expect(plan.changes.length).toBe(3);
    writeFileSync(join(root, "src/tool.py"), "def f(a, b, c):\n    pass\n");
    const before = snapshot(root);
    expect(() => writeChanges(plan.changes)).toThrow(
      "src/tool.py: changed on disk after it was read; nothing was written",
    );
    expect(snapshot(root)).toEqual(before);
  });

  test("a target that vanished stops the write, and no file is written", async () => {
    const root = makeRepository(untidy);
    const plan = await makePlan(root, []);
    Bun.spawnSync(["rm", join(root, "src/run.sh")]);
    expect(() => writeChanges(plan.changes)).toThrow("src/run.sh: ");
    expect(read(root, "README.md")).toBe(untidy["README.md"]);
  });

  test("targets that still hold the bytes that were formatted are written", async () => {
    const root = makeRepository(untidy);
    const plan = await makePlan(root, []);
    writeChanges(plan.changes);
    expect(read(root, "src/run.sh")).toBe("if true; then\n  echo hi\nfi\n");
  });
});

describe("R2 (ruling 2): one process stays, so a signal reaches the work", () => {
  test.skipIf(!existsSync("/proc/self/stat"))(
    "the process the launcher started is the Bun process, with no child",
    async () => {
      const root = makeRepository(untidy);
      const path = `${join(process.execPath, "..")}:${process.env["PATH"] ?? ""}`;
      const child = Bun.spawn([launcher, "write"], {
        cwd: root,
        env: { ...process.env, PATH: path },
        stdout: "pipe",
        stderr: "pipe",
      });
      const pid = child.pid;
      let command = "";
      for (let tries = 0; tries < 200; tries += 1) {
        try {
          command = readFileSync(`/proc/${pid}/cmdline`, "utf8");
        } catch {
          break;
        }
        if (command.includes("src/main.ts")) {
          break;
        }
        await Bun.sleep(5);
      }
      expect(command).toContain("--no-env-file");
      expect(command).toContain("src/main.ts");
      expect(command).not.toContain("/bin/sh");
      child.kill("SIGTERM");
      await child.exited;
      let children: string[] = [];
      try {
        children = readdirSync(`/proc/${pid}/task`);
      } catch {
        // the process is gone, which is the answer
      }
      expect(children).toEqual([]);
    },
  );
});
