import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createContextResolverHttpServer } from '../src/http.js';
import { ContextResolverService } from '../src/service.js';
import { createStaticContextSources } from '../src/adapters/static.js';

const servers: Array<ReturnType<typeof createContextResolverHttpServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('HTTP adapter', () => {
  it('exposes health and context endpoints', async () => {
    const service = new ContextResolverService(
      createStaticContextSources({
        projects: {
          PIM: {
            id: 'PIM',
            name: 'Product Information Management',
            defaultRepository: 'VespiarioThailand/product-information',
            defaultBranch: 'main',
            testingCompliance: 'compliant',
            businessContextStatus: 'scaffolded_pending_human_review',
            deploymentStatus: 'verified',
          },
        },
      }),
    );

    const server = createContextResolverHttpServer(service);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const healthResponse = await fetch(`${baseUrl}/healthz`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: 'ok' });

    const contextResponse = await fetch(`${baseUrl}/v1/projects/PIM/context`);
    expect(contextResponse.status).toBe(200);
    const context = (await contextResponse.json()) as {
      project: { id: string };
      routing: { repositories: Array<{ repository: string }> };
      decision: { can_deploy_production: boolean };
    };

    expect(context.project.id).toBe('PIM');
    expect(context.routing.repositories[0]?.repository).toBe(
      'VespiarioThailand/product-information',
    );
    expect(context.decision.can_deploy_production).toBe(false);
  });

  it('returns a structured 400 for invalid requests', async () => {
    const service = new ContextResolverService(createStaticContextSources({}));
    const server = createContextResolverHttpServer(service);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/v1/context/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema_version: 1, request_id: 'bad' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});
