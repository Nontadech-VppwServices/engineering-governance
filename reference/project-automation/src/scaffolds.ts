import type { NewProjectRequest } from './types.js';

export function selectArchetype(project: NewProjectRequest): string {
  const awsTypes = ['website', 'web_frontend', 'fullstack_application', 'backend_service'];
  const rpaTypes = ['rpa', 'rpa_export', 'browser_automation'];
  if (project.deployment_type === 'aws' && awsTypes.includes(project.project_type)) return 'aws-nextjs-typescript';
  if (project.deployment_type === 'on_prem' && rpaTypes.includes(project.project_type)) return 'onprem-playwright-typescript-rpa';
  throw new Error('No accepted default archetype matches the requested project/deployment type; an accepted ADR exception is required.');
}

export function buildScaffold(project: NewProjectRequest, archetype: string): Record<string, string> {
  return archetype === 'aws-nextjs-typescript' ? awsScaffold(project) : rpaScaffold(project);
}

function awsScaffold(project: NewProjectRequest): Record<string, string> {
  const packageName = packageSlug(project.repository);
  return {
    'README.md': `# ${project.name}\n\nGenerated from the governed \`aws-nextjs-typescript\` archetype. Review through a pull request before use. Run \`npm install\` and commit the generated lockfile before the first PR.\n`,
    'package.json': JSON.stringify({ name: packageName, version: '0.1.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start', typecheck: 'tsc --noEmit', test: 'vitest run', 'test:e2e': 'playwright test' }, dependencies: { next: '^16.3.3', react: '^19.2.8', 'react-dom': '^19.2.8' }, devDependencies: { '@playwright/test': '^1.62.1', '@types/node': '^22.18.0', '@types/react': '^19.2.18', typescript: '^5.9.2', vitest: '^3.2.4' } }, null, 2) + '\n',
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, incremental: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', plugins: [{ name: 'next' }] }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts'], exclude: ['node_modules'] }, null, 2) + '\n',
    '.nvmrc': `22\n`,
    'app/layout.tsx': `import type { ReactNode } from 'react';\nexport default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n`,
    'app/page.tsx': `export default function Home() { return <main><h1>${escapeCode(project.name)}</h1></main>; }\n`,
    'app/api/health/route.ts': `export function GET() { return Response.json({ status: 'ok' }); }\n`,
    'tests/api/health.test.ts': `import { describe, expect, it } from 'vitest';\nimport { GET } from '../../app/api/health/route';\ndescribe('health', () => { it('returns ok', async () => expect(await GET().json()).toEqual({ status: 'ok' })); });\n`,
    'tests/e2e/home.spec.ts': `import { expect, test } from '@playwright/test';\ntest('home renders', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading')).toBeVisible(); });\n`,
    'playwright.config.ts': `import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: 'tests/e2e', use: { baseURL: 'http://127.0.0.1:3000' }, webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: true } });\n`,
    'vitest.config.ts': `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { include: ['tests/api/**/*.test.ts'] } });\n`,
    'src/env.ts': `export function readPort(value = process.env.PORT): number { const port = Number(value ?? '3000'); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.'); return port; }\n`,
    'src/log.ts': `export function log(event: string, fields: Record<string, unknown> = {}) { console.log(JSON.stringify({ event, occurred_at: new Date().toISOString(), ...fields })); }\n`,
    'Dockerfile': `FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\nFROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app ./\nEXPOSE 3000\nCMD ["npm", "start"]\n`,
    '.dockerignore': `node_modules\n.next\n.env\n`,
    '.env.example': `NODE_ENV=development\nPORT=3000\n`,
    '.gitignore': `node_modules/\n.next/\nplaywright-report/\n.env\n!.env.example\n`,
    '.ai/project.yaml': projectYaml(project, 'aws-nextjs-typescript'),
    'docs/business/README.md': `# Business context\n\nStatus: pending human review. Do not copy live Jira state here.\n`,
    'docs/adr/README.md': `# Project ADRs\n`,
    'docs/bdr/README.md': `# Project BDRs\n`,
    '.github/workflows/ci.yml': `name: CI\non: [push, pull_request]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - run: npm install\n      - run: npm run typecheck\n      - run: npm test\n      - run: npm run build\n      - run: npx playwright install --with-deps chromium\n      - run: npm run test:e2e\n`,
  };
}

function rpaScaffold(project: NewProjectRequest): Record<string, string> {
  const packageName = packageSlug(project.repository);
  return {
    'README.md': `# ${project.name}\n\nGenerated from the governed \`onprem-playwright-typescript-rpa\` archetype. Run \`npm install\` and commit the generated lockfile before the first PR.\n`,
    'package.json': JSON.stringify({ name: packageName, version: '0.1.0', private: true, scripts: { start: 'tsx src/index.ts', typecheck: 'tsc --noEmit', test: 'vitest run', smoke: 'playwright test' }, dependencies: { '@playwright/test': '^1.62.1' }, devDependencies: { '@types/node': '^22.18.0', tsx: '^4.23.12', typescript: '^5.9.2', vitest: '^3.2.4' } }, null, 2) + '\n',
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true }, include: ['src/**/*.ts', 'tests/**/*.ts'] }, null, 2) + '\n',
    '.nvmrc': `22\n`,
    'src/index.ts': `import { randomUUID } from 'node:crypto';\nconst runId = randomUUID();\nconsole.log(JSON.stringify({ schema_version: 1, event_id: randomUUID(), run_id: runId, bot_id: '${escapeCode(project.id)}', project_id: '${escapeCode(project.id)}', environment: process.env.BOT_ENVIRONMENT ?? 'unknown', event_type: 'started', occurred_at: new Date().toISOString(), evidence: { correlation_id: runId } }));\n`,
    'src/retry.ts': `export async function withRetry<T>(operation: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> { let last: unknown; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { return await operation(); } catch (error) { last = error; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt)); } } throw last; }\n`,
    'tests/workflow.test.ts': `import { expect, it, vi } from 'vitest';\nimport { withRetry } from '../src/retry.js';\nit('retries a transient failure', async () => { const operation = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('ok'); expect(await withRetry(operation, 2, 0)).toBe('ok'); expect(operation).toHaveBeenCalledTimes(2); });\n`,
    'tests/smoke.spec.ts': `import { expect, test } from '@playwright/test';\ntest('browser starts', async ({ page }) => { await page.setContent('<h1>ready</h1>'); await expect(page.getByText('ready')).toBeVisible(); });\n`,
    'playwright.config.ts': `import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: 'tests', testMatch: 'smoke.spec.ts' });\n`,
    'vitest.config.ts': `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });\n`,
    'Dockerfile': `FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install && npx playwright install --with-deps chromium\nCOPY . .\nCMD ["npm", "start"]\n`,
    'compose.yaml': `services:\n  bot:\n    build: .\n    env_file: .env\n    restart: "no"\n`,
    '.env.example': `BOT_TIMEZONE=Asia/Bangkok\nBOT_ENVIRONMENT=local\nREPORTING_API_URL=http://reporting:8080\n`,
    '.gitignore': `node_modules/\ntest-results/\nplaywright-report/\n.env\n!.env.example\n`,
    '.ai/project.yaml': projectYaml(project, 'onprem-playwright-typescript-rpa'),
    'docs/business/README.md': `# Business context\n\nStatus: pending human review.\n`,
    'docs/adr/README.md': `# Project ADRs\n`,
    'docs/bdr/README.md': `# Project BDRs\n`,
    '.github/workflows/ci.yml': `name: CI\non: [push, pull_request]\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n      - run: npm install\n      - run: npm run typecheck\n      - run: npm test\n      - run: docker build .\n`,
  };
}

function projectYaml(project: NewProjectRequest, archetype: string): string {
  return `schema_version: 1\nproject:\n  id: ${project.id}\n  name: ${yamlString(project.name)}\n  domain: ${yamlString(project.domain)}\n  type: ${project.project_type}\n  archetype: ${archetype}\nrepository:\n  name: ${project.repository}\ndeployment:\n  type: ${project.deployment_type}\nai:\n  deny:\n    merge: true\n    production_deploy: true\n    production_credentials: true\n`;
}

function packageSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

function escapeCode(value: string): string {
  return value.replace(/[\\'`$]/g, '');
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
