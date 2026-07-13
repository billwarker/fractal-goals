import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.js',
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        pool: 'forks',
        // Was fully serial (maxWorkers: 1) to fight test hangs; re-parallelized
        // 2026-07-13 after repeated green full-suite runs. If hangs or
        // order-dependent flakes reappear, bisect the offending test before
        // reaching for maxWorkers: 1 again.
        maxWorkers: 4,
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 5000,
        coverage: {
            reporter: ['text', 'html'],
            exclude: ['node_modules/', 'src/test/']
        }
    }
});
