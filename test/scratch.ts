import { afterEach, setDefaultTimeout } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const launcher = join(import.meta.dir, "..", "bin", "formatter");
export const entry = join(import.meta.dir, "..", "src", "main.ts");

// A test that runs the command several times takes a few seconds on an idle
// machine; five seconds is too tight when the machine is busy.
setDefaultTimeout(30_000);

process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

export function scratchDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "formatter-test-"));
  directories.push(directory);
  return directory;
}

export interface Link {
  readonly link: string;
}

export type Tree = Readonly<Record<string, string | Uint8Array | Link>>;

export function git(cwd: string, args: readonly string[]): string {
  const result = Bun.spawnSync(
    ["git", "-c", "init.defaultBranch=main", ...args],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

export function writeTree(root: string, tree: Tree): void {
  for (const [path, content] of Object.entries(tree)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    if (typeof content === "string" || content instanceof Uint8Array) {
      writeFileSync(absolute, content);
    } else {
      symlinkSync(content.link, absolute);
    }
  }
}

export function makeRepository(tree: Tree): string {
  const root = scratchDirectory();
  git(root, ["init", "-q"]);
  writeTree(root, tree);
  git(root, ["add", "-A"]);
  return root;
}

export interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function runFormatter(
  cwd: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Run {
  return runCommand([launcher], cwd, args, environment);
}

// The launcher finds Bun on the path, as it does under `bun run`.
export function runCommand(
  command: readonly string[],
  cwd: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Run {
  const path = `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}`;
  const result = Bun.spawnSync([...command, ...args], {
    cwd,
    env: { ...process.env, PATH: path, ...environment },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export function snapshot(root: string): Map<string, string> {
  const entries = new Map<string, string>();
  const visit = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = prefix + name;
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink()) {
        entries.set(path, `link ${readlinkSync(absolute)}`);
      } else if (stats.isDirectory()) {
        visit(absolute, path + "/");
      } else {
        const digest = new Bun.CryptoHasher("sha256")
          .update(readFileSync(absolute))
          .digest("hex");
        entries.set(path, `file ${stats.mode.toString(8)} ${digest}`);
      }
    }
  };
  visit(root, "");
  return entries;
}

export function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}
