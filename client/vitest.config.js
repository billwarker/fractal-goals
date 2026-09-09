import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.js',
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        // Threads reduce worker startup/transform overhead while keeping each
        // file isolated. Keep the worker count bounded for local and CI memory.
        pool: 'threads',
        isolate: true,
        maxWorkers: 4,
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 5000,
        coverage: {
            reporter: ['text', 'html', 'json-summary'],
            include: ['src/**/*.{js,jsx}'],
            // Ratchet the measured all-source baseline; raise these as coverage grows.
            thresholds: { statements: 63.5, branches: 57.8, functions: 60, lines: 65.8 },
            exclude: ['node_modules/', 'src/test/']
        }
    }
});
