import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/main.ts'),
            name: 'SendSpinBootstrap',
            fileName: 'sendspin-bootstrap',
            formats: ['iife'],
        },
        outDir: '../custom_components/sendspin_player/frontend',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'sendspin-bootstrap.js',
                // Ensure we don't code-split, we want one file
                inlineDynamicImports: true,
            }
        }
    },
    define: {
        'process.env.NODE_ENV': '"production"'
    }
});
