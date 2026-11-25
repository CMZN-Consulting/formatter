export class SetError extends Error {
  override name = "SetError";
}

export interface Entry {
  readonly path: string;
  readonly mode: string;
}

const decoder = new TextDecoder();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function git(args: readonly string[], cwd: string): string {
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
    const reason = decoder.decode(result.stderr).trim();
    throw new SetError(reason === "" ? `git ${args.join(" ")} failed` : reason);
  }
  return decoder.decode(result.stdout);
}

function records(output: string): string[] {
  return output.split("\0").filter((record) => record !== "");
}

export function findRoot(cwd: string): string {
  try {
    return git(["rev-parse", "--show-toplevel"], cwd).replace(/\n$/, "");
  } catch {
    throw new SetError("not inside the working tree of a git repository");
  }
}

export function trackedEntries(root: string): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const record of records(
    git(["ls-files", "-z", "--cached", "--stage"], root),
  )) {
    const tab = record.indexOf("\t");
    const path = record.slice(tab + 1);
    if (!seen.has(path)) {
      seen.add(path);
      entries.push({ path, mode: record.slice(0, record.indexOf(" ")) });
    }
  }
  return entries;
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
