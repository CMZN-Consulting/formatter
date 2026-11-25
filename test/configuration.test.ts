import { describe, expect, test } from "bun:test";
import { makeRepository, read, runFormatter } from "./scratch.ts";

const content = {
  "README.md": "Title\n=====\n\n* one\n    * nested\n",
  "src/main.ts": "export function f(a:number){\nreturn a+1}\n",
  "src/data.json": '{"a":1,"b":{"c":[1,2]}}\n',
  "tool.py":
    "def f(a,b):\n  return {'sum':a+b,'difference':a-b,'product':a*b,'quotient':a/b}\n",
  "run.sh": "if true;then\necho  hi\nfi\n",
};

const configuration = {
  ".prettierrc":
    '{ "tabWidth": 8, "useTabs": true, "semi": false, "singleQuote": true }\n',
  ".editorconfig":
    "root = true\n\n[*]\nindent_style = tab\nindent_size = 8\nend_of_line = crlf\nmax_line_length = 40\n",
  ".prettierignore": "README.md\n*.json\nsrc/\n",
  "ruff.toml":
    'line-length = 40\n\n[format]\nquote-style = "single"\nindent-style = "tab"\n',
  "pyproject.toml":
    '[tool.ruff]\nline-length = 40\n\n[tool.ruff.format]\nquote-style = "single"\n',
};

describe("M5: a repository's configuration changes no byte of the result (L5)", () => {
  test("write gives the same bytes with and without the configuration files", () => {
    const plain = makeRepository(content);
    const configured = makeRepository({ ...content, ...configuration });
    expect(runFormatter(plain, ["write"]).exitCode).toBe(0);
    expect(runFormatter(configured, ["write"]).exitCode).toBe(0);
    for (const path of Object.keys(content)) {
      expect(read(configured, path)).toBe(read(plain, path));
    }
  });

  test("the result is the tools' defaults", () => {
    const configured = makeRepository({ ...content, ...configuration });
    expect(runFormatter(configured, ["write"]).exitCode).toBe(0);
    expect(read(configured, "src/main.ts")).toBe(
      "export function f(a: number) {\n  return a + 1;\n}\n",
    );
    expect(read(configured, "src/data.json")).toBe(
      '{ "a": 1, "b": { "c": [1, 2] } }\n',
    );
    expect(read(configured, "run.sh")).toBe("if true; then\n  echo hi\nfi\n");
    expect(read(configured, "tool.py")).toBe(
      'def f(a, b):\n    return {"sum": a + b, "difference": a - b, "product": a * b, "quotient": a / b}\n',
    );
  });

  test("the configuration files are themselves classed like any file", () => {
    const configured = makeRepository({ ...content, ...configuration });
    const run = runFormatter(configured, ["check", "--json"]);
    const report = JSON.parse(run.stdout);
    expect(report.unformatted).toEqual({
      ".editorconfig": 1,
      ".prettierignore": 1,
      ".toml": 2,
    });
  });
});
