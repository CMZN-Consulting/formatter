import { PositionEncoding, Workspace } from "@astral-sh/ruff-wasm-nodejs";
import type { Backend } from "../backend.ts";

const byteOrderMark = "﻿";
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
    const marked = text.startsWith(byteOrderMark);
    const formatted = workspace.format(marked ? text.slice(1) : text);
    return marked ? byteOrderMark + formatted : formatted;
  },
};
