import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  launcher,
  makeRepository,
  runCommand,
  scratchDirectory,
  snapshot,
  type Run,
} from "./scratch.ts";

const untidy = {
  "README.md": "Title\n=====\n\n* one\n* two\n",
  "src/tool.py": "def f(a,b):\n  return a+b\n",
  "src/sub/data.json": '{"a":1}\n',
};

const bunfigs: Readonly<Record<string, string>> = {
  "a define of process.argv":
    '[define]\n"process.argv" = "[\\"bun\\",\\"x\\",\\"write\\"]"\n',
  "a define of process.execPath":
    '[define]\n"process.execPath" = "\\"/nonexistent/bun\\""\n',
};

const root = join(import.meta.dir, "..");

// Three ways to start the command: the file itself, a link to it in
// node_modules/.bin under a path that holds a space, and a relative link to a
// copy that sits beside that link.
function entries(): Readonly<Record<string, string>> {
  const base = join(scratchDirectory(), "a path with a space");
  const bin = join(base, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  symlinkSync(launcher, join(bin, "formatter"));

  const copy = join(base, "copy");
  mkdirSync(copy, { recursive: true });
  for (const name of ["bin", "src", "package.json"]) {
    cpSync(join(root, name), join(copy, name), { recursive: true });
  }
  symlinkSync(
    realpathSync(join(root, "node_modules")),
    join(copy, "node_modules"),
  );
  const relative = join(base, "relative", "node_modules", ".bin");
  mkdirSync(relative, { recursive: true });
  symlinkSync("../../../copy/bin/formatter", join(relative, "formatter"));

  return {
    "the file itself": launcher,
    "a link in node_modules/.bin": join(bin, "formatter"),
    "a relative link to a copy": join(relative, "formatter"),
  };
}

const startNames = [
  "the file itself",
  "a link in node_modules/.bin",
  "a relative link to a copy",
];

function outcome(run: Run): [number, string] {
  return [run.exitCode, run.stdout];
}

describe("no code of the formatter runs in a process that read the repository's bunfig.toml", () => {
  for (const [bunfigName, bunfig] of Object.entries(bunfigs)) {
    for (const startName of startNames) {
      for (const where of ["", "src/sub"]) {
        test(`${bunfigName} changes nothing: ${startName}, from ${where === "" ? "the top" : "a subdirectory"}`, () => {
          const start = entries()[startName] ?? "";
          const plain = makeRepository(untidy);
          const configured = makeRepository(untidy);
          writeFileSync(join(configured, "bunfig.toml"), bunfig);
          const before = snapshot(configured);
          for (const args of [["check"], ["check", "--json"]]) {
            const expected = runCommand([start], join(plain, where), args);
            const actual = runCommand([start], join(configured, where), args);
            expect(expected.exitCode).toBe(1);
            expect(actual.exitCode).toBe(1);
            expect(outcome(actual)).toEqual(
              outcome(expected).map((part) =>
                typeof part === "string"
                  ? part.replaceAll(plain, configured)
                  : part,
              ) as [number, string],
            );
          }
          const after = snapshot(configured);
          after.delete("bunfig.toml");
          before.delete("bunfig.toml");
          expect(after).toEqual(before);
        });
      }
    }
  }

  test("CDPATH in the environment changes nothing, for a start by a relative name", () => {
    const repository = makeRepository(untidy);
    // A directory named bin inside the repository, reached as bin/formatter.
    symlinkSync(dirname(launcher), join(repository, "bin"));
    const decoy = join(scratchDirectory(), "decoy");
    mkdirSync(join(decoy, "bin"), { recursive: true });
    const plain = runCommand(["bin/formatter"], repository, ["check"]);
    expect(plain.exitCode).toBe(1);
    for (const cdpath of [decoy, `${decoy}:`, ":", `${repository}`]) {
      const run = runCommand(["bin/formatter"], repository, ["check"], {
        CDPATH: cdpath,
      });
      expect(run.stderr).toBe(plain.stderr);
      expect(run.exitCode).toBe(1);
      expect(run.stdout).toBe(plain.stdout);
    }
  });

  test("the launcher is a POSIX sh file that is executable", () => {
    expect(Bun.spawnSync(["head", "-n", "1", launcher]).stdout.toString()).toBe(
      "#!/bin/sh\n",
    );
    expect(Bun.spawnSync(["test", "-x", launcher]).exitCode).toBe(0);
  });

  test.skipIf(
    ["/usr/bin/bun", "/bin/bun", "/usr/local/bin/bun"].some(existsSync),
  )("the launcher says so when bun is not on the path", () => {
    const run = runCommand([launcher], scratchDirectory(), ["check"], {
      PATH: "/usr/bin:/bin",
    });
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("bun was not found on the path");
  });

  test("package.json names the launcher as the bin", async () => {
    const manifest = await Bun.file(join(root, "package.json")).json();
    expect(manifest.bin).toEqual({ formatter: "bin/formatter" });
    expect(dirname(join(root, manifest.bin.formatter))).toBe(dirname(launcher));
  });
});
