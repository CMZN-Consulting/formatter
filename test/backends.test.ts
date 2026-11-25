import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import formatterPackage from "../package.json" with { type: "json" };
import type { Backend, Source } from "../src/backend.ts";
import { backends } from "../src/backends/index.ts";

const fixtures = join(import.meta.dir, "fixtures");

const pairs = [
  { backend: "prettier", extension: "md" },
  { backend: "ruff", extension: "py" },
  { backend: "shell", extension: "sh" },
] as const;

function backendNamed(name: string): Backend {
  const backend = backends.find((candidate) => candidate.name === name);
  if (backend === undefined) {
    throw new Error(`no backend ${name}`);
  }
  return backend;
}

function source(backend: string, name: string): Source {
  return {
    path: `test/fixtures/${backend}/${name}`,
    absolute: join(fixtures, backend, name),
  };
}

describe("M1: each backend formats its fixture", () => {
  for (const pair of pairs) {
    const backend = backendNamed(pair.backend);
    const input = source(pair.backend, `input.${pair.extension}`);
    const expected = source(pair.backend, `expected.${pair.extension}`);
    const expectedText = readFileSync(expected.absolute, "utf8");

    test(`${pair.backend} claims both fixture files`, async () => {
      expect(await backend.claims(input)).toBe(true);
      expect(await backend.claims(expected)).toBe(true);
    });

    test(`${pair.backend} formats the input to the expected text`, async () => {
      const inputText = readFileSync(input.absolute, "utf8");
      expect(inputText).not.toBe(expectedText);
      expect(await backend.format(inputText, input)).toBe(expectedText);
    });

    test(`${pair.backend} formats the expected text to itself`, async () => {
      expect(await backend.format(expectedText, expected)).toBe(expectedText);
    });
  }
});

describe("the backends", () => {
  test("come in the order prettier, ruff, shell", () => {
    expect(backends.map((backend) => backend.name)).toEqual([
      "prettier",
      "ruff",
      "shell",
    ]);
  });

  test("report the versions that package.json pins", () => {
    const pins: Readonly<Record<string, string>> =
      formatterPackage.dependencies;
    expect(backendNamed("prettier").version).toBe(pins["prettier"] ?? "");
    expect(backendNamed("ruff").version).toBe(
      pins["@astral-sh/ruff-wasm-nodejs"] ?? "",
    );
    expect(backendNamed("shell").version).toBe(pins["sh-syntax"] ?? "");
  });

  test("claim names as section 4 says", async () => {
    const claims = async (path: string): Promise<string | undefined> => {
      for (const backend of backends) {
        if (
          await backend.claims({
            path,
            absolute: join(fixtures, "absent", path),
          })
        ) {
          return backend.name;
        }
      }
      return undefined;
    };
    expect(await claims("README.md")).toBe("prettier");
    expect(await claims("data.json")).toBe("prettier");
    expect(await claims("src/main.ts")).toBe("prettier");
    expect(await claims(".github/workflows/ci.yml")).toBe("prettier");
    expect(await claims("node_modules/vendored.js")).toBe("prettier");
    expect(await claims("tool.py")).toBe("ruff");
    expect(await claims("run.sh")).toBe("shell");
    expect(await claims("run.bash")).toBe("shell");
    expect(await claims("catalog.typify")).toBeUndefined();
    expect(await claims("Cargo.toml")).toBeUndefined();
    expect(await claims("main.rkt")).toBeUndefined();
    expect(await claims("Main.lean")).toBeUndefined();
    expect(await claims("types.pyi")).toBeUndefined();
  });
});
