import { defineConfig } from 'vite';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'fantasy-draft-wizard';

export default defineConfig({
  base: process.env.VITE_BASE ?? (process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  publicDir: 'public',
});
