import { spawn } from 'node:child_process';

// With 4 parallel workers the full suite runs ~1.5-4 min depending on machine load (a busy
// laptop is several times slower than an idle one). 8 min still catches a real hang without
// failing a legitimate run; override with VITEST_WALL_TIMEOUT_MS when needed.
const DEFAULT_TIMEOUT_MS = 480_000;
const timeoutMs = Number.parseInt(process.env.VITEST_WALL_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;

// `--related <files...>` runs only tests importing the given source files
// (vitest related); anything else falls through to a full `vitest run`.
const cliArgs = process.argv.slice(2);
const isRelatedRun = cliArgs[0] === '--related';
const args = isRelatedRun
    // Related runs normally cover only a few files, but a change to a shared module (a context,
    // a provider) fans out across most of the suite, so they use the full worker count.
    ? ['vitest', 'related', '--run', ...cliArgs.slice(1)]
    : ['vitest', 'run', ...cliArgs];

const childEnv = { ...process.env };
const disableNativeWebStorage = '--no-experimental-webstorage';
if (
    process.allowedNodeEnvironmentFlags.has(disableNativeWebStorage)
    && !childEnv.NODE_OPTIONS?.includes('webstorage')
) {
    // jsdom owns Web Storage in tests; Node 25's experimental global conflicts
    // with it and emits one missing-persistence-file warning per worker.
    childEnv.NODE_OPTIONS = [childEnv.NODE_OPTIONS, disableNativeWebStorage]
        .filter(Boolean)
        .join(' ');
}

const child = spawn('npx', args, {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    env: childEnv,
});

let finished = false;

const timer = setTimeout(() => {
    if (finished) return;
    finished = true;
    console.error(`\nVitest exceeded ${timeoutMs}ms wall timeout. Terminating test process.`);
    terminate('SIGTERM');
    setTimeout(() => {
        if (child.exitCode == null) {
            terminate('SIGKILL');
        }
    }, 2_000).unref();
    process.exitCode = 124;
}, timeoutMs);

function terminate(signal) {
    if (process.platform === 'win32') {
        child.kill(signal);
        return;
    }
    try {
        process.kill(-child.pid, signal);
    } catch {
        child.kill(signal);
    }
}

child.on('exit', (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (signal) {
        console.error(`Vitest exited via signal ${signal}.`);
        process.exitCode = 1;
        return;
    }
    process.exitCode = code ?? 1;
});

child.on('error', (error) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    console.error(`Failed to start Vitest: ${error.message}`);
    process.exitCode = 1;
});
