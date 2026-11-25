import { print } from "sh-syntax";
import shSyntax from "sh-syntax/package.json" with { type: "json" };
import type { Backend } from "../backend.ts";

export const shellBackend: Backend = {
  name: "shell",
  version: shSyntax.version,
  async claims(source) {
    return source.path.endsWith(".sh") || source.path.endsWith(".bash");
  },
  format(text, source) {
    return print(text, { filepath: source.path });
  },
};
