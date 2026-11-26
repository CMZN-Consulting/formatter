import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Backend, Source } from "./backend.ts";
import { backends } from "./backends/index.ts";
import {
  baseName,
  decodeText,
  ignoreFileName,
  isLink,
  toolWritten,
  type ClassName,
} from "./classes.ts";
import {
  escapedOf,
  findRoot,
  ignoredPaths,
  selectedPaths,
  SetError,
  textOf,
  trackedEntries,
  type Entry,
} from "./git.ts";

export interface PlannedFile {
  readonly path: string;
  readonly className: ClassName;
  readonly backend?: string;
}

export interface Change {
  readonly path: string;
  readonly absolute: string;
  readonly original: Uint8Array;
  readonly bytes: Uint8Array;
}

export interface Failure {
  readonly path: string;
  readonly backend: string;
  readonly message: string;
}

export interface Plan {
  readonly root: string;
  readonly files: readonly PlannedFile[];
  readonly changes: readonly Change[];
  readonly failures: readonly Failure[];
}

const encoder = new TextEncoder();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lstatTracked(path: string, absolute: string) {
  try {
    return lstatSync(absolute);
  } catch (error) {
    throw new SetError(
      `${path}: tracked but not readable: ${messageOf(error)}`,
    );
  }
}

function checkDirectories(
  root: string,
  path: string,
  verified: Set<string>,
): void {
  const parts = path.split("/");
  for (let count = 1; count < parts.length; count += 1) {
    const directory = parts.slice(0, count).join("/");
    if (verified.has(directory)) {
      continue;
    }
    if (!lstatTracked(path, join(root, directory)).isDirectory()) {
      throw new SetError(
        `${path}: on disk, ${directory} is not a directory but a link or a file`,
      );
    }
    verified.add(directory);
  }
}

function checkIgnoreFile(root: string, entry: Entry): void {
  if (isLink(entry.mode)) {
    throw new SetError(
      `${ignoreFileName} is tracked as a link, and a link is never followed`,
    );
  }
  if (!lstatTracked(ignoreFileName, join(root, ignoreFileName)).isFile()) {
    throw new SetError(`${ignoreFileName} is not a regular file on disk`);
  }
}

function readTracked(source: Source): Uint8Array {
  if (!lstatTracked(source.path, source.absolute).isFile()) {
    throw new SetError(
      `${source.path}: tracked as a file but not a regular file on disk`,
    );
  }
  return readFileSync(source.absolute);
}

async function claimant(source: Source): Promise<Backend | undefined> {
  for (const backend of backends) {
    if (await backend.claims(source)) {
      return backend;
    }
  }
  return undefined;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

export async function makePlan(
  cwd: string,
  paths: readonly string[],
): Promise<Plan> {
  const root = findRoot(cwd);
  const entries = trackedEntries(root).sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );
  const selected = paths.length === 0 ? undefined : selectedPaths(cwd, paths);
  const ignoreEntry = entries.find((entry) => entry.key === ignoreFileName);
  let ignored = new Set<string>();
  if (ignoreEntry !== undefined) {
    checkIgnoreFile(root, ignoreEntry);
    ignored = ignoredPaths(root, ignoreFileName);
  }
  const verified = new Set<string>();
  const files: PlannedFile[] = [];
  const changes: Change[] = [];
  const failures: Failure[] = [];
  for (const entry of entries) {
    if (selected !== undefined && !selected.has(entry.key)) {
      continue;
    }
    const text = textOf(entry.key);
    const shown = text ?? Buffer.from(entry.key, "latin1").toString("utf8");
    if (isLink(entry.mode)) {
      files.push({ path: shown, className: "link" });
      continue;
    }
    if (ignored.has(entry.key)) {
      files.push({ path: shown, className: "ignored" });
      continue;
    }
    if (toolWritten.has(baseName(entry.key))) {
      files.push({ path: shown, className: "tool-written" });
      continue;
    }
    if (text === undefined) {
      throw new SetError(
        `${escapedOf(entry.key)}: the name is not valid UTF-8; name it in ${ignoreFileName}`,
      );
    }
    checkDirectories(root, text, verified);
    const source: Source = { path: text, absolute: join(root, text) };
    const bytes = readTracked(source);
    const content = decodeText(bytes);
    if (content === undefined) {
      files.push({ path: text, className: "binary" });
      continue;
    }
    const backend = await claimant(source);
    if (backend === undefined) {
      files.push({ path: text, className: "unformatted" });
      continue;
    }
    files.push({
      path: text,
      className: "formatted",
      backend: backend.name,
    });
    const links = lstatTracked(text, source.absolute).nlink;
    if (links > 1) {
      throw new SetError(
        `${text}: has ${links} hard links on disk, and a write would change every name of the file`,
      );
    }
    let formatted: string;
    try {
      formatted = await backend.format(content, source);
    } catch (error) {
      failures.push({
        path: text,
        backend: backend.name,
        message: messageOf(error),
      });
      continue;
    }
    const output = encoder.encode(formatted);
    if (!sameBytes(output, bytes)) {
      changes.push({
        path: text,
        absolute: source.absolute,
        original: bytes,
        bytes: output,
      });
    }
  }
  return { root, files, changes, failures };
}
