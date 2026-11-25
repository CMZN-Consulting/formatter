import { PositionEncoding, Workspace } from "@astral-sh/ruff-wasm-nodejs";
import type { Backend } from "../backend.ts";

let workspace: Workspace | undefined;

export const ruffBackend: Backend = {
  name: "ruff",
  version: Workspace.version(),
  async claims(source) {
    return source.path.endsWith(".py");
  },
  async format(text) {
    workspace ??= new Workspace(
      Workspace.defaultSettings(),
      PositionEncoding.Utf16,
    );
    return workspace.format(text);
  },
};
