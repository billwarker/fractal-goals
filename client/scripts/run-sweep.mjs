#!/usr/bin/env node
// `npm run sweep [-- <playwright args>]`: build the client, capture every surface in
// e2e/sweep/manifest.js at each viewport × theme, then write sweep-results/index.html.
// The report is written even when checks fail. Pass --no-build to reuse the last build,
// e.g. `npm run sweep -- --no-build --grep settings`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const playwrightArgs = args.filter((arg) => arg !== '--no-build');

const run = (command, commandArgs, env = process.env) => spawnSync(command, commandArgs, {
    cwd: clientRoot, stdio: 'inherit', env,
}).status ?? 1;

if (!skipBuild && run('npx', ['vite', 'build']) !== 0) process.exit(1);
const status = run('npx', ['playwright', 'test', ...playwrightArgs], { ...process.env, SWEEP: '1' });
run('node', ['scripts/sweep-report.mjs']);
process.exit(status);
