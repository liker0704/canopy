import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { saveConfig } from "../config.ts";
import { errorOut, humanOut, jsonOut } from "../output.ts";
import { ExitError } from "../types.ts";

export default async function init(_args: string[], json: boolean): Promise<void> {
	const cwd = process.cwd();
	const canopyDir = join(cwd, ".tane");

	if (_args.includes("--help") || _args.includes("-h")) {
		humanOut(`Usage: cn init

Initializes .tane/ in the current directory with config and empty JSONL stores.`);
		return;
	}

	if (existsSync(canopyDir)) {
		if (json) {
			jsonOut({ success: false, command: "init", error: ".tane/ already exists" });
		} else {
			errorOut(".tane/ already exists");
		}
		throw new ExitError(1);
	}

	mkdirSync(canopyDir, { recursive: true });

	// Write default config
	await saveConfig(cwd, {
		project: "tane",
		version: "1",
		targets: {
			default: { dir: "agents", default: true },
		},
	});

	// Write .gitignore for .tane/
	await Bun.write(join(canopyDir, ".gitignore"), "*.lock\n");

	// Create empty JSONL files
	await Bun.write(join(canopyDir, "prompts.jsonl"), "");
	await Bun.write(join(canopyDir, "schemas.jsonl"), "");

	// Append .gitattributes to project root
	const gitattrsPath = join(cwd, ".gitattributes");
	const gitattrsEntry = ".tane/prompts.jsonl merge=union\n.tane/schemas.jsonl merge=union\n";

	let existing = "";
	try {
		existing = await Bun.file(gitattrsPath).text();
	} catch {
		existing = "";
	}

	if (!existing.includes(".tane/prompts.jsonl")) {
		await Bun.write(gitattrsPath, existing + gitattrsEntry);
	}

	if (json) {
		jsonOut({ success: true, command: "init", dir: canopyDir });
	} else {
		humanOut(`Initialized .tane/ in ${cwd}`);
		humanOut("  config.yaml: project=tane, targets: default → agents/");
		humanOut("  prompts.jsonl created");
		humanOut("  schemas.jsonl created");
		humanOut("  .gitattributes updated with merge=union");
	}
}

export function registerInitCommand(program: Command): void {
	program
		.command("init")
		.description("Initialize .tane/ in current directory")
		.option("--json", "Output as JSON")
		.action(async (options: { json?: boolean }) => {
			const args = options.json ? ["--json"] : [];
			await init(args, options.json ?? false);
		});
}
