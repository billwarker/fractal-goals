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
        fileParallelism: false,
        maxWorkers: 1,
        testTimeout: 10000,
        hookTimeout: 10000,
        teardownTimeout: 5000,
        coverage: {
            reporter: ['text', 'html'],
            exclude: ['node_modules/', 'src/test/']
        }
    }
});
