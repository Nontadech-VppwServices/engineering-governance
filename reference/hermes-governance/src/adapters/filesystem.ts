import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { SkillPublisher } from '../ports.js';
import type { ImprovementProposal } from '../types.js';
export class FilesystemSkillPublisher implements SkillPublisher {
  constructor(private readonly root: string) {}
  async publish(proposal: ImprovementProposal): Promise<string> {
    const { skill } = proposal;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.name) || !/^[A-Za-z0-9._-]+$/.test(skill.version)) throw new Error('Unsafe skill name or version.');
    const directory = resolve(this.root, `${skill.name}-${skill.version}`); const relativePath = relative(resolve(this.root), directory);
    if (!relativePath || relativePath.startsWith('..')) throw new Error('Skill output escapes configured root.');
    await mkdir(directory, { recursive: true });
    const document = proposal.kind === 'skill_retire'
      ? `# Reviewed skill retirement\n\nSkill: ${skill.name}\nVersion: ${skill.version}\nProposal: ${proposal.proposal_id}\n\n${skill.content.trim()}\n`
      : `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\nversion: ${skill.version}\nauthor: Engineering Governance\nmetadata:\n  hermes:\n    category: engineering\n    tags: [governance, generated, reviewed]\n---\n\n${skill.content.trim()}\n`;
    const destination = resolve(directory, proposal.kind === 'skill_retire' ? 'RETIREMENT.md' : 'SKILL.md');
    try { await writeFile(destination, document, { encoding: 'utf8', flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(destination, 'utf8') !== document) throw error;
    }
    return destination;
  }
}
