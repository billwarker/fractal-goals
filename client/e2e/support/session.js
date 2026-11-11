import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The workflow suite signs `browser_user` in once (e2e/auth.setup.js); every desktop and mobile
// test starts from that saved session instead of the login form. Sessions last 72 h, far longer
// than a run. Specs that test signing in themselves opt out with an empty storageState.
const authDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.auth');
export const BROWSER_USER_STATE = path.join(authDirectory, 'browser-user.json');
const BROWSER_USER_TOKEN = path.join(authDirectory, 'browser-user-token.json');

export const BROWSER_USER = { username: 'browser_user', password: 'BrowserTest123!' };

export function saveApiToken(token) {
    fs.mkdirSync(authDirectory, { recursive: true });
    fs.writeFileSync(BROWSER_USER_TOKEN, JSON.stringify({ token }));
}

/** The signed-in user's API bearer token, for specs that seed data through fetch. */
export function apiToken() {
    return JSON.parse(fs.readFileSync(BROWSER_USER_TOKEN, 'utf8')).token;
}

/**
 * Puts a signed-in page on the app's origin without loading the app, so a spec can seed data
 * with page-context fetch before navigating to what it tests. (Loading the Selection page just to
 * wait for it fetched every fractal: the slowest request in the suite.)
 */
export async function openOrigin(page) {
    await page.goto('/api/healthz');
}
