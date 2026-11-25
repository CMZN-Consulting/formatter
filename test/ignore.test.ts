import { describe, expect, test } from "bun:test";
import { makePlan } from "../src/plan.ts";
import { git, makeRepository } from "./scratch.ts";

const lines = [
  "fixtures/",
  "!fixtures/keep.json",
  "*.snap",
  "!keep.snap",
  "/top.json",
  "docs/**/generated.md",
  "",
].join("\n");

const files = {
  "README.md": "# Read me\n",
  "fixtures/a.json": "{}\n",
  "fixtures/keep.json": "{}\n",
  "fixtures/deep/b.json": "{}\n",
  "x.snap": "x\n",
  "keep.snap": "x\n",
  "sub/y.snap": "y\n",
  "top.json": "{}\n",
  "sub/top.json": "{}\n",
  "docs/generated.md": "# Generated\n",
  "docs/a/generated.md": "# Generated\n",
  "docs/written.md": "# Written\n",
};

const ignoredByHand = [
  "docs/a/generated.md",
  "docs/generated.md",
  "fixtures/a.json",
  "fixtures/deep/b.json",
  "fixtures/keep.json",
  "sub/y.snap",
  "top.json",
  "x.snap",
];

async function ignoredByFormatter(): Promise<string[]> {
  const root = makeRepository({ ...files, ".formatterignore": lines });
  const plan = await makePlan(root, []);
  return plan.files
    .filter((file) => file.className === "ignored")
    .map((file) => file.path);
}

function ignoredByGitignore(): string[] {
  const root = makeRepository({ ...files, ".gitignore": lines });
  git(root, ["add", "--force", "--", ...Object.keys(files)]);
  const tracked = Object.keys(files);
  const output = git(root, ["check-ignore", "--no-index", "--", ...tracked]);
  return output
    .split("\n")
    .filter((path) => path !== "")
    .sort();
}

describe("M4: .formatterignore means what .gitignore means", () => {
  test("a negation and a directory pattern select what the same .gitignore selects", async () => {
    const formatter = await ignoredByFormatter();
    expect(formatter).toEqual(ignoredByGitignore());
    expect(formatter).toEqual(ignoredByHand);
  });

  test("a negation re-includes a file whose directory is not excluded", async () => {
    const formatter = await ignoredByFormatter();
    expect(formatter).not.toContain("keep.snap");
    expect(formatter).toContain("x.snap");
  });

  test("an untracked .formatterignore is not read", async () => {
    const root = makeRepository(files);
    await Bun.write(`${root}/.formatterignore`, lines);
    const plan = await makePlan(root, []);
    expect(plan.files.filter((file) => file.className === "ignored")).toEqual(
      [],
    );
  });
});
