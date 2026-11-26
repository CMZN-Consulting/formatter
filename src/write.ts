import {
  accessSync,
  constants,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { SetError } from "./git.ts";
import type { Change } from "./plan.ts";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(right);
}

// Every target is checked before the first byte is written: it must be
// writable, and it must still hold the bytes that were formatted. A file that
// someone edited since is never written over.
export function writeChanges(changes: readonly Change[]): void {
  for (const change of changes) {
    try {
      accessSync(change.absolute, constants.W_OK);
    } catch (error) {
      throw new SetError(`${change.path}: not writable: ${messageOf(error)}`);
    }
  }
  for (const change of changes) {
    let current: Uint8Array;
    try {
      if (!lstatSync(change.absolute).isFile()) {
        throw new Error("no longer a regular file");
      }
      current = readFileSync(change.absolute);
    } catch (error) {
      throw new SetError(
        `${change.path}: could not be read again before writing: ${messageOf(error)}; nothing was written`,
      );
    }
    if (!sameBytes(current, change.original)) {
      throw new SetError(
        `${change.path}: changed on disk after it was read; nothing was written`,
      );
    }
  }
  for (const change of changes) {
    writeFileSync(change.absolute, change.bytes);
  }
}
