export function buildAiBranchName(issueKey: string, summary: string): string {
  const key = issueKey.toLowerCase();
  const slug = summary
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return `ai/${key}${slug ? `-${slug}` : ''}`;
}
