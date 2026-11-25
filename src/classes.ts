export const classNames = [
  "link",
  "ignored",
  "tool-written",
  "binary",
  "formatted",
  "unformatted",
] as const;

export type ClassName = (typeof classNames)[number];

export const ignoreFileName = ".formatterignore";

export const toolWritten: ReadonlySet<string> = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "uv.lock",
  "Cargo.lock",
  "flake.lock",
  "lake-manifest.json",
]);

const linkModes: ReadonlySet<string> = new Set(["120000", "160000"]);
const binaryWindow = 8000;
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function isLink(mode: string): boolean {
  return linkModes.has(mode);
}

export function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.subarray(0, binaryWindow).includes(0)) {
    return undefined;
  }
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return undefined;
  }
}

export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "(none)" : name.slice(dot);
}

export function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
