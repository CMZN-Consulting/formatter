import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Backend, Source } from "./backend.ts";
import { backends } from "./backends/index.ts";
import {
  baseName,
  compareBytes,
  decodeText,
  ignoreFileName,
  isLink,
  toolWritten,
  type ClassName,
} from "./classes.ts";
import {
  findRoot,
  ignoredPaths,
  selectedPaths,
  SetError,
  trackedEntries,
} from "./git.ts";

export interface PlannedFile {
  readonly path: string;
  readonly className: ClassName;
  readonly backend?: string;
}

export interface Change {
  readonly path: string;
  readonly absolute: string;
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

function readTracked(source: Source): Uint8Array {
  let stats;
  try {
    stats = lstatSync(source.absolute);
  } catch (error) {
    throw new SetError(
      `${source.path}: tracked but not readable: ${messageOf(error)}`,
    );
  }
  if (!stats.isFile()) {
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
    compareBytes(left.path, right.path),
  );
  const selected = paths.length === 0 ? undefined : selectedPaths(cwd, paths);
  const ignored = entries.some((entry) => entry.path === ignoreFileName)
    ? ignoredPaths(root, ignoreFileName)
    : new Set<string>();
  const files: PlannedFile[] = [];
  const changes: Change[] = [];
  const failures: Failure[] = [];
  for (const entry of entries) {
    if (selected !== undefined && !selected.has(entry.path)) {
      continue;
    }
    const source: Source = {
      path: entry.path,
      absolute: join(root, entry.path),
    };
    if (isLink(entry.mode)) {
      files.push({ path: entry.path, className: "link" });
      continue;
    }
    if (ignored.has(entry.path)) {
      files.push({ path: entry.path, className: "ignored" });
      continue;
    }
    if (toolWritten.has(baseName(entry.path))) {
      files.push({ path: entry.path, className: "tool-written" });
      continue;
    }
    const bytes = readTracked(source);
    const text = decodeText(bytes);
    if (text === undefined) {
      files.push({ path: entry.path, className: "binary" });
      continue;
    }
    const backend = await claimant(source);
    if (backend === undefined) {
      files.push({ path: entry.path, className: "unformatted" });
      continue;
    }
    files.push({
      path: entry.path,
      className: "formatted",
      backend: backend.name,
    });
    let formatted: string;
    try {
      formatted = await backend.format(text, source);
    } catch (error) {
      failures.push({
        path: entry.path,
        backend: backend.name,
        message: messageOf(error),
      });
      continue;
    }
    const output = encoder.encode(formatted);
    if (!sameBytes(output, bytes)) {
      changes.push({
        path: entry.path,
        absolute: source.absolute,
        bytes: output,
      });
    }
  }
  return { root, files, changes, failures };
}
