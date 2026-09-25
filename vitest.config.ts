/// <reference types="vitest/config" />
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getViteConfig } from 'astro/config';

// Set before Astro loads its config: real env vars take precedence over a developer's local .env,
// so tests never depend on (or touch) local credentials and data.
Object.assign(process.env, {
  DATA_DIR: mkdtempSync(path.join(tmpdir(), 'terroir-test-')),
  ADMIN_LOGIN: 'admin',
  ADMIN_PASSWORD: 'correct-horse-battery',
});

// getViteConfig wires Astro virtual modules (astro:env/server) into Vitest.
export default getViteConfig({
  test: {
    // All test files share one SQLite file, so run them one at a time.
    fileParallelism: false,
  },
});
