import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHermesGovernanceHttpServer, HermesGovernanceService, InMemoryLearningStore, InMemorySkillPublisher } from '../src/index.js';

const servers: ReturnType<typeof createHermesGovernanceHttpServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe('Phase 6 HTTP API', () => {
  it('requires authentication and returns explicit non-authority metadata', async () => {
    const server = createHermesGovernanceHttpServer(new HermesGovernanceService(new InMemoryLearningStore(), new InMemorySkillPublisher()), 'test-token-at-least-16');
    servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${url}/v1/memories?scope=PIM`)).status).toBe(401);
    const response = await fetch(`${url}/v1/memories?scope=PIM`, { headers: { authorization: 'Bearer test-token-at-least-16' } });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ authoritative: false, records: [] });
  });
});
