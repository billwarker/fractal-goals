import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 120_000;
const timeoutMs = Number.parseInt(process.env.VITEST_WALL_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;
const args = ['vitest', 'run', ...process.argv.slice(2)];

const child = spawn('npx', args, {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
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
