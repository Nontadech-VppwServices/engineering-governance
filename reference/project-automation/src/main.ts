import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { FilesystemScaffoldPublisher } from './adapters/filesystem.js';
import { PostgresPlanStore } from './adapters/postgres.js';
import { createProjectAutomationHttpServer } from './http.js';
import { ProjectAutomationService } from './service.js';

const databaseUrl = required('DATABASE_URL');
const apiToken = required('PHASE5_API_TOKEN');
const outputRoot = process.env.GENERATED_OUTPUT_DIR ?? '/data/generated-projects';
const port = Number(process.env.PHASE5_PORT ?? '8085');
const pool = new pg.Pool({ connectionString: databaseUrl });
const sqlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../sql/001_project_automation.sql');
await pool.query(await readFile(sqlPath, 'utf8'));
const server = createProjectAutomationHttpServer(new ProjectAutomationService(new PostgresPlanStore(pool), new FilesystemScaffoldPublisher(outputRoot)), apiToken);
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service: 'project-automation', port })));

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; }
