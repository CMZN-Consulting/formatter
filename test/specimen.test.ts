import { expect, test } from "bun:test";
import { makeRepository, runFormatter } from "./scratch.ts";

test("the specimen repository gives the report the definition shows", () => {
  const root = makeRepository({
    "README.md": "# Tool\n\nIt works.\n",
    "tool.py": "x=1\n",
    "catalog.typify": "catalog\n",
    "bun.lock": "{}\n",
    "fixtures/case.json": '{ "a":1 }\n',
    ".formatterignore": "fixtures/\n",
  });
  const run = runFormatter(root, ["check"]);
  expect(run.stdout).toBe(
    [
      "formatted      2",
      "unformatted    2",
      "  .formatterignore  1",
      "  .typify           1",
      "tool-written   1",
      "ignored        1",
      "would change   1",
      "  tool.py",
      "",
    ].join("\n"),
  );
  expect(run.exitCode).toBe(1);
});
