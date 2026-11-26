export class SetError extends Error {
  override name = "SetError";
}

// A path from git is kept as a byte string: one character per byte, so that
// a name that is not valid UTF-8 keeps its identity and sorts by its bytes.
export interface Entry {
  readonly key: string;
  readonly mode: string;
  readonly unmerged: boolean;
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function git(args: readonly string[], cwd: string): Buffer {
  let result;
  try {
    result = Bun.spawnSync(["git", ...args], {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new SetError(`git could not be run: ${messageOf(error)}`);
  }
  if (result.exitCode !== 0) {
    const reason = result.stderr.toString("utf8").trim();
    throw new SetError(reason === "" ? `git ${args.join(" ")} failed` : reason);
  }
  return result.stdout;
}

function records(output: Buffer): string[] {
  return output
    .toString("latin1")
    .split("\0")
    .filter((record) => record !== "");
}

export function textOf(key: string): string | undefined {
  try {
    return strictUtf8.decode(Buffer.from(key, "latin1"));
  } catch {
    return undefined;
  }
}

export function escapedOf(key: string): string {
  return [...key]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x20 && code < 0x7f
        ? character
        : `\\x${code.toString(16).padStart(2, "0")}`;
    })
    .join("");
}

export function findRoot(cwd: string): string {
  let output: Buffer;
  try {
    output = git(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    throw new SetError("not inside the working tree of a git repository");
  }
  const root = textOf(output.toString("latin1").replace(/\n$/, ""));
  if (root === undefined) {
    throw new SetError("the repository's own path is not valid UTF-8");
  }
  return root;
}

export function trackedEntries(root: string): Entry[] {
  const byKey = new Map<string, Entry>();
  for (const record of records(
    git(["ls-files", "-z", "--cached", "--stage"], root),
  )) {
    const tab = record.indexOf("\t");
    const key = record.slice(tab + 1);
    const [mode = "", , stage = "0"] = record.slice(0, tab).split(" ");
    const unmerged = stage !== "0";
    const known = byKey.get(key);
    if (known === undefined) {
      byKey.set(key, { key, mode, unmerged });
    } else if (unmerged && !known.unmerged) {
      byKey.set(key, { ...known, unmerged });
    }
  }
  return [...byKey.values()];
}

export function selectedPaths(
  cwd: string,
  paths: readonly string[],
): Set<string> {
  const args = [
    "--literal-pathspecs",
    "ls-files",
    "-z",
    "--cached",
    "--full-name",
  ];
  return new Set(
    records(git([...args, "--error-unmatch", "--", ...paths], cwd)),
  );
}

export function ignoredPaths(root: string, ignoreFile: string): Set<string> {
  const args = [
    "-c",
    "core.ignoreCase=false",
    "ls-files",
    "-z",
    "--cached",
    "--ignored",
  ];
  return new Set(records(git([...args, `--exclude-from=${ignoreFile}`], root)));
}
