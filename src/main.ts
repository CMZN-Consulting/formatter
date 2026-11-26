import { SetError } from "./git.ts";
import { makePlan } from "./plan.ts";
import { makeReport, renderJson, renderText } from "./report.ts";
import { writeChanges } from "./write.ts";

const usage = `usage: formatter check [--json] [PATH ...]
       formatter write [--json] [PATH ...]
`;

interface Command {
  readonly mode: "check" | "write";
  readonly json: boolean;
  readonly paths: readonly string[];
}

function parse(args: readonly string[]): Command | undefined {
  const [mode, ...rest] = args;
  if (mode !== "check" && mode !== "write") {
    return undefined;
  }
  let json = false;
  let options = true;
  const paths: string[] = [];
  for (const arg of rest) {
    if (options && arg === "--") {
      options = false;
    } else if (options && arg === "--json") {
      json = true;
    } else if (options && arg.startsWith("-")) {
      return undefined;
    } else {
      paths.push(arg);
    }
  }
  return { mode, json, paths };
}

async function main(args: readonly string[]): Promise<number> {
  const command = parse(args);
  if (command === undefined) {
    process.stderr.write(usage);
    return 2;
  }
  const plan = await makePlan(process.cwd(), command.paths);
  const failed = plan.failures.length > 0;
  let label = "would change";
  if (command.mode === "write" && !failed) {
    writeChanges(plan.changes);
    label = "changed";
  }
  const report = makeReport(plan);
  process.stdout.write(
    command.json ? renderJson(report) : renderText(report, label),
  );
  if (failed) {
    return 2;
  }
  return command.mode === "check" && plan.changes.length > 0 ? 1 : 0;
}

export async function run(args: readonly string[]): Promise<number> {
  try {
    return await main(args);
  } catch (error) {
    const message = error instanceof SetError ? error.message : String(error);
    process.stderr.write(`formatter: ${message}\n`);
    return 2;
  }
}

process.exitCode = await run(process.argv.slice(2));
