import type { Backend } from "../backend.ts";
import { prettierBackend } from "./prettier.ts";
import { ruffBackend } from "./ruff.ts";
import { shellBackend } from "./shell.ts";

export const backends: readonly Backend[] = [
  prettierBackend,
  ruffBackend,
  shellBackend,
];
