import fs from "fs";
import path from "path";
import * as core from "@actions/core";
import { parse } from "dotenv";
import { expand } from "dotenv-expand";
import axios, { isAxiosError } from "axios";

type LoadMode = "strict" | "skip";

interface Inputs {
	folder: string;
	mode: string;
	loadMode: LoadMode;
}

async function validateSubscription(): Promise<void> {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	let repoPrivate: boolean | undefined;

	if (eventPath && fs.existsSync(eventPath)) {
		const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
		repoPrivate = eventData?.repository?.private;
	}

	const upstream = "xom9ikk/dotenv";
	const action = process.env.GITHUB_ACTION_REPOSITORY;
	const docsUrl =
		"https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

	core.info("");
	core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
	core.info(`Secure drop-in replacement for ${upstream}`);
	if (repoPrivate === false)
		core.info("\u001b[32m\u2713 Free for public repositories\u001b[0m");
	core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
	core.info("");

	if (repoPrivate === false) return;

	const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
	const body: Record<string, string> = { action: action || "" };
	if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;

	try {
		await axios.post(
			`https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
			body,
			{ timeout: 3000 },
		);
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 403) {
			core.error(
				`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`,
			);
			core.error(
				`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`,
			);
			process.exit(1);
		}
		core.info("Timeout or API not reachable. Continuing to next step.");
	}
}

const VALID_MODE = /^[A-Za-z0-9_.-]+$/;

const PROTECTED_NAMES = new Set([
	"PATH",
	"NODE_OPTIONS",
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"DYLD_INSERT_LIBRARIES",
	"DYLD_LIBRARY_PATH",
]);
const PROTECTED_PREFIXES = ["GITHUB_", "RUNNER_", "CI_", "ACTIONS_"];

function readInputs(): Inputs {
	const folder = core.getInput("path") || "./";
	const mode = core.getInput("mode");
	const rawLoadMode = core.getInput("load-mode") || "strict";

	if (rawLoadMode !== "strict" && rawLoadMode !== "skip") {
		throw new Error(
			`Invalid 'load-mode' value: "${rawLoadMode}". Expected "strict" or "skip".`,
		);
	}

	if (mode && !VALID_MODE.test(mode)) {
		throw new Error(
			`Invalid 'mode' value: "${mode}". Allowed characters: A-Z a-z 0-9 _ . -`,
		);
	}

	return { folder, mode, loadMode: rawLoadMode };
}

function resolveEnvFile(folder: string, mode: string): string {
	const suffix = mode ? `.${mode}` : "";
	const filename = `.env${suffix}`;
	const resolved = path.resolve(folder, filename);

	const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
	if (resolved !== workspace && !resolved.startsWith(workspace + path.sep)) {
		throw new Error(`Refusing to read .env outside the workspace: ${resolved}`);
	}

	return resolved;
}

function isProtectedName(key: string): boolean {
	if (PROTECTED_NAMES.has(key)) return true;
	return PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// Soft threshold for .env file size. Real .env files are typically <10 KB.
// We don't block over-limit files (workflow author may have a legitimate reason),
// but we surface a warning so the operator knows large files may OOM the runner.
const ENV_FILE_SIZE_WARN_BYTES = 1024 * 1024; // 1 MB

function readEnvFile(filePath: string, loadMode: LoadMode): string | null {
	try {
		const stat = fs.statSync(filePath);
		if (stat.size > ENV_FILE_SIZE_WARN_BYTES) {
			core.warning(
				`.env file at ${filePath} is ${stat.size} bytes (>${ENV_FILE_SIZE_WARN_BYTES} bytes). ` +
					`Reading it anyway, but large files may exhaust runner memory.`,
			);
		}
		return fs.readFileSync(filePath, "utf8");
	} catch (error) {
		if (loadMode === "skip") {
			core.info(
				`Could not read ${filePath} (${error}); load-mode=skip, continuing.`,
			);
			return null;
		}
		throw error;
	}
}

function exportAll(values: Record<string, string>): void {
	const keys = Object.keys(values);
	if (keys.length === 0) {
		core.info("No environment variables parsed.");
		return;
	}
	let exported = 0;
	let skipped = 0;
	for (const key of keys) {
		if (isProtectedName(key)) {
			core.warning(
				`Skipping reserved variable "${key}" — refusing to override CI-managed environment.`,
			);
			skipped += 1;
			continue;
		}
		core.exportVariable(key, values[key]);
		exported += 1;
	}
	core.info(
		`Exported ${exported} variable(s) to GITHUB_ENV` +
			(skipped > 0 ? ` (skipped ${skipped} reserved name(s))` : "") +
			".",
	);
}

async function run(): Promise<void> {
	await validateSubscription();

	const inputs = readInputs();
	const filePath = resolveEnvFile(inputs.folder, inputs.mode);
	core.info(`Loading env file: ${filePath}`);

	const contents = readEnvFile(filePath, inputs.loadMode);
	if (contents === null) return;

	const parsed = parse(contents);
	const expanded = expand({ parsed }).parsed ?? {};

	exportAll(expanded);
}

run().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	core.error(message);
	core.setFailed(message);
});
