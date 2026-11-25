import * as prettier from "prettier";
import type { Backend } from "../backend.ts";

export const prettierBackend: Backend = {
  name: "prettier",
  version: prettier.version,
  async claims(source) {
    const info = await prettier.getFileInfo(source.absolute, {
      resolveConfig: false,
      withNodeModules: true,
    });
    return info.inferredParser !== null;
  },
  format(text, source) {
    return prettier.format(text, { filepath: source.absolute });
  },
};
