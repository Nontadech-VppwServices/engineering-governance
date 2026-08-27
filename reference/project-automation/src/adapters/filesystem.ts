import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { ScaffoldPublisher } from '../ports.js';

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export class FilesystemScaffoldPublisher implements ScaffoldPublisher {
  constructor(private readonly root: string) {}

  async publish(outputName: string, files: Record<string, string>): Promise<{ path: string; files: string[] }> {
    if (!SAFE_NAME.test(outputName)) throw new Error('Output name contains unsafe characters.');
    const outputRoot = resolve(this.root, outputName);
    assertBelow(resolve(this.root), outputRoot);
    for (const [file, content] of Object.entries(files)) {
      if (file.startsWith('/') || file.split('/').includes('..')) throw new Error(`Unsafe scaffold path: ${file}`);
      const destination = resolve(outputRoot, file);
      assertBelow(outputRoot, destination);
      await mkdir(dirname(destination), { recursive: true });
      try { await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(destination, 'utf8') !== content) throw error;
      }
    }
    return { path: outputRoot, files: Object.keys(files).sort() };
  }
}

function assertBelow(root: string, target: string): void {
  const path = relative(root, target);
  if (!path || path.startsWith('..') || path.startsWith('/')) throw new Error('Output path escapes or overwrites the staging root.');
}
