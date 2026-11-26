import { writeSync } from "node:fs";

function codeOf(error: unknown): string {
  return error instanceof Error && "code" in error ? String(error.code) : "";
}

// Writes the text to a descriptor, and never lets the outcome of the write
// reach the exit status. It returns the reason when the text could not be
// written whole, and undefined when a closed pipe is the reason, which is a
// reader that chose to stop and is not a fault.
export function emit(descriptor: 1 | 2, text: string): string | undefined {
  const data = Buffer.from(text);
  let offset = 0;
  while (offset < data.length) {
    try {
      offset += writeSync(descriptor, data, offset);
    } catch (error) {
      const code = codeOf(error);
      if (code === "EAGAIN") {
        Bun.sleepSync(1);
        continue;
      }
      return code === "EPIPE"
        ? undefined
        : error instanceof Error
          ? error.message
          : String(error);
    }
  }
  return undefined;
}
