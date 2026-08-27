import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { FilesystemSkillPublisher } from './adapters/filesystem.js';
import { PostgresLearningStore } from './adapters/postgres.js';
import { createHermesGovernanceHttpServer } from './http.js';
import { HermesGovernanceService } from './service.js';
const databaseUrl = required('DATABASE_URL'); const token = required('PHASE6_API_TOKEN'); const port = Number(process.env.PHASE6_PORT ?? '8086');
const pool = new pg.Pool({ connectionString: databaseUrl }); const sqlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../sql/001_hermes_learning.sql'); await pool.query(await readFile(sqlPath, 'utf8'));
createHermesGovernanceHttpServer(new HermesGovernanceService(new PostgresLearningStore(pool), new FilesystemSkillPublisher(process.env.HERMES_GENERATED_SKILLS_DIR ?? '/data/generated-skills')), token).listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service: 'hermes-governance', port })));
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; }
