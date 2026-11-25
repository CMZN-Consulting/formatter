import formatterPackage from "../package.json" with { type: "json" };
import { backends } from "./backends/index.ts";
import {
  classNames,
  compareBytes,
  extensionOf,
  type ClassName,
} from "./classes.ts";
import type { Failure, Plan } from "./plan.ts";

export interface Report {
  readonly root: string;
  readonly version: string;
  readonly backends: Readonly<Record<string, string>>;
  readonly classes: Readonly<Record<ClassName, number>>;
  readonly unformatted: Readonly<Record<string, number>>;
  readonly changed: readonly string[];
  readonly failed: readonly Failure[];
}

const textOrder: readonly ClassName[] = [
  "formatted",
  "unformatted",
  "tool-written",
  "binary",
  "ignored",
  "link",
];
const labelWidth = 15;

export function makeReport(plan: Plan): Report {
  const classes = Object.fromEntries(
    classNames.map((name) => [name, 0]),
  ) as Record<ClassName, number>;
  const extensions = new Map<string, number>();
  for (const file of plan.files) {
    classes[file.className] += 1;
    if (file.className === "unformatted") {
      const extension = extensionOf(file.path);
      extensions.set(extension, (extensions.get(extension) ?? 0) + 1);
    }
  }
  const unformatted = Object.fromEntries(
    [...extensions].sort(([left], [right]) => compareBytes(left, right)),
  );
  return {
    root: plan.root,
    version: formatterPackage.version,
    backends: Object.fromEntries(
      backends.map((backend) => [backend.name, backend.version]),
    ),
    classes,
    unformatted,
    changed: plan.changes.map((change) => change.path),
    failed: plan.failures,
  };
}

function firstLine(text: string): string {
  const end = text.indexOf("\n");
  return end === -1 ? text : text.slice(0, end);
}

export function renderText(report: Report, changedLabel: string): string {
  const lines: string[] = [];
  for (const name of textOrder) {
    const count = report.classes[name];
    if (count === 0) {
      continue;
    }
    lines.push(name.padEnd(labelWidth) + count);
    if (name === "unformatted") {
      const extensions = Object.entries(report.unformatted);
      const width =
        Math.max(...extensions.map(([extension]) => extension.length)) + 2;
      for (const [extension, extensionCount] of extensions) {
        lines.push("  " + extension.padEnd(width) + extensionCount);
      }
    }
  }
  lines.push(changedLabel.padEnd(labelWidth) + report.changed.length);
  for (const path of report.changed) {
    lines.push("  " + path);
  }
  if (report.failed.length > 0) {
    lines.push("failed".padEnd(labelWidth) + report.failed.length);
    for (const failure of report.failed) {
      lines.push(
        `  ${failure.path}  ${failure.backend}: ${firstLine(failure.message)}`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2) + "\n";
}
