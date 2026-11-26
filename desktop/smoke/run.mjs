// Drives the real Mac app (a smoke build) through what no browser test can: the Keychain, a restart,
// the menu bar, and unsent changes kept on disk while the server can't be reached.
//
//   npm run smoke        builds client/dist and the smoke app, then runs it against the test server
//
// The app's window opens on screen while it runs.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(fileURLToPath(import.meta.url), '../..');
const repo = resolve(desktop, '..');
const IDENTIFIER = 'com.fractalgoals.mac.smoke';
const SERVER = 8012;
const PROXY = 8013;
const USER = { username: 'browser_user', password: 'BrowserTest123!' };
const ROOT = 'browser-offline-root-desktop';
const binary = join(desktop, 'target/release/bundle/macos/Fractal Goals Smoke.app/Contents/MacOS/fractal-goals');
const dataDir = join(homedir(), 'Library/Application Support', IDENTIFIER);
const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { stdio: 'inherit', ...options });
    if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
};

// The server sits behind a door the runner can close: the Mac stays online, the server is gone.
let open = true;
const sockets = new Set();
const proxy = createServer((client) => {
    if (!open) return client.destroy();
    const server = connect(SERVER, '127.0.0.1');
    for (const socket of [client, server]) {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
    }
    client.pipe(server).pipe(client);
});
const setReachable = (reachable) => {
    open = reachable;
    if (!reachable) for (const socket of sockets) socket.destroy();
};

function forget() {
    spawnSync('security', ['delete-generic-password', '-s', IDENTIFIER, '-a', 'refresh-token'], { stdio: 'ignore' });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(join(homedir(), 'Library/WebKit', IDENTIFIER), { recursive: true, force: true });
    rmSync(join(homedir(), 'Library/Caches', IDENTIFIER), { recursive: true, force: true });
}

async function launch(step, extra = {}) {
    const reportFile = join(tmpdir(), `fractal-smoke-${step}.json`);
    rmSync(reportFile, { force: true });
    const app = spawn(binary, [], {
        stdio: 'ignore',
        env: {
            ...process.env,
            FRACTAL_SMOKE_SCRIPT: join(desktop, 'smoke/steps.js'),
            FRACTAL_SMOKE: JSON.stringify({ step, ...USER, ...extra }),
            FRACTAL_SMOKE_REPORT: reportFile,
        },
    });
    const exited = new Promise((done) => app.on('exit', done));
    const timeout = setTimeout(() => app.kill(), 90_000);
    await exited;
    clearTimeout(timeout);
    if (!existsSync(reportFile)) throw new Error(`${step}: the app reported nothing`);
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    console.log(`${report.ok ? '✓' : '✗'} ${step}`, JSON.stringify(report));
    if (!report.ok) throw new Error(`${step} failed`);
    return report;
}

async function api(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(`http://127.0.0.1:${SERVER}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body && JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.json();
}

async function waitForServer() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
            if ((await fetch(`http://127.0.0.1:${SERVER}/api/readyz`)).ok) return;
        } catch { /* starting */ }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('The test server did not start');
}

const check = (condition, message) => {
    if (!condition) throw new Error(message);
};

async function main() {
    if (!process.argv.includes('--no-build')) {
        run('npm', ['--prefix', join(repo, 'client'), 'run', '-s', 'build'], {
            env: { ...process.env, VITE_API_URL: '/api' },
        });
        run('npx', ['tauri', 'build', '--bundles', 'app', '--features', 'smoke', '--config', 'smoke/smoke.conf.json'], {
            cwd: desktop,
            env: { ...process.env, FRACTAL_APP_URL: `http://127.0.0.1:${PROXY}` },
        });
    }
    const python = process.env.PYTHON || join(repo, 'fractal-goals-venv/bin/python');
    const server = spawn(python, [join(repo, 'scripts/browser_test_server.py')], {
        cwd: join(repo, 'client'),
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, CORS_ORIGINS: 'tauri://localhost' },
    });
    await new Promise((done) => proxy.listen(PROXY, '127.0.0.1', done));
    try {
        await waitForServer();
        forget();
        const signIn = await launch('signIn');
        check(signIn.keptSignIn, 'the sign-in was not kept in the Keychain');
        check(signIn.randomUUID && signIn.locks, 'the web view lacks what the client needs');
        check(signIn.serviceWorkers === 0, 'a service worker was installed');

        const { access_token: token, user } = await api('/auth/token', {
            method: 'POST', body: { ...USER, username_or_email: USER.username, platform: 'macos', device_name: 'Smoke runner' },
        });
        const goalName = `Smoke ${Date.now()}`;
        const goal = await api(`/${ROOT}/goals`, { method: 'POST', token, body: { name: goalName, type: 'LongTermGoal', parent_id: ROOT } });
        const { active_session: open } = await api(`/${ROOT}/sessions/active`, { token });
        if (!open) {
            await api(`/${ROOT}/sessions`, { method: 'POST', token, body: { name: 'Smoke session', parent_ids: [goal.id], session_start: new Date().toISOString() } });
        }
        const context = { root: ROOT, goalId: goal.id, goalName, newName: `Kept ${goalName}`, userId: user.id };
        const reopened = await launch('reopen', context);
        check(/^\d+:\d\d/.test(reopened.timer.replace('❙❙ ', '')), 'the menu bar shows no session');

        setReachable(false);
        const offline = await launch('offline', context);
        check(offline.queued === 1, 'the change was not queued');
        const files = readdirSync(join(dataDir, 'unsent'), { recursive: true }).filter((name) => String(name).endsWith('.json'));
        check(files.length === 1, `expected one unsent change on disk, found ${files.length}`);

        setReachable(true);
        await launch('drain', context);
        const saved = await api(`/${ROOT}/goals/${goal.id}`, { token });
        check(saved.name === context.newName, `the server has "${saved.name}"`);
        console.log('✓ the change made offline reached the server after a restart');
        writeFileSync(join(tmpdir(), 'fractal-smoke-ok'), new Date().toISOString());
    } finally {
        proxy.close();
        server.kill('SIGTERM');
        forget();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
