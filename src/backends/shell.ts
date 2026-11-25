import { print } from "sh-syntax";
import shSyntax from "sh-syntax/package.json" with { type: "json" };
import type { Backend } from "../backend.ts";

function refuseCarriageReturn(text: string): void {
  const index = text.indexOf("\r");
  if (index !== -1) {
    const line = text.slice(0, index).split("\n").length;
    throw new Error(
      `line ${line} holds a carriage return byte (0x0D), which sh-syntax reads as a blank and bash as part of a word`,
    );
  }
}

export const shellBackend: Backend = {
  name: "shell",
  version: shSyntax.version,
  async claims(source) {
    return source.path.endsWith(".sh") || source.path.endsWith(".bash");
  },
  async format(text, source) {
    refuseCarriageReturn(text);
    return print(text, { filepath: source.path });
  },
};
