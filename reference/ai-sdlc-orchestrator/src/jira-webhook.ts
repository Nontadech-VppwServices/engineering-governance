import type { IntakeEvent, WorkType } from './types.js';

export interface JiraWebhookNormalizerConfig {
  targetAssigneeAccountIds?: string[];
  allowedProjectKeys?: string[];
  componentFieldId?: string;
  workTypeFieldId?: string;
  triggerOnIssueCreatedWhenAssigned?: boolean;
  triggerOnAssigneeChange?: boolean;
}

export interface JiraWebhookNormalizationInput {
  webhookIdentifier?: string | null;
  receivedAt?: string;
}

type JiraWebhookPayload = {
  webhookEvent?: string;
  timestamp?: number;
  issue?: {
    id?: string;
    key?: string;
    fields?: Record<string, unknown> & {
      project?: { key?: string };
      issuetype?: { name?: string };
      assignee?: { accountId?: string; displayName?: string } | null;
      components?: Array<{ name?: string }>;
    };
  };
  changelog?: {
    items?: Array<{
      field?: string;
      fieldId?: string;
      from?: string | null;
      fromString?: string | null;
      to?: string | null;
      toString?: string | null;
    }>;
  };
};

export function normalizeJiraWebhook(
  payload: unknown,
  config: JiraWebhookNormalizerConfig = {},
  input: JiraWebhookNormalizationInput = {},
): IntakeEvent | null {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Jira webhook payload.');
  const value = payload as JiraWebhookPayload;
  const issue = value.issue;
  if (!issue?.key || !issue.fields) throw new Error('Jira webhook issue key/fields are required.');

  const projectKey = issue.fields.project?.key ?? issue.key.split('-')[0] ?? '';
  if (!projectKey) throw new Error('Jira webhook project key is required.');
  if (config.allowedProjectKeys?.length && !config.allowedProjectKeys.includes(projectKey)) return null;

  const assigneeId = issue.fields.assignee?.accountId ?? null;
  const targetAssignees = config.targetAssigneeAccountIds ?? [];
  if (targetAssignees.length && (!assigneeId || !targetAssignees.includes(assigneeId))) return null;

  const webhookEvent = value.webhookEvent ?? '';
  const assigneeChanged = value.changelog?.items?.some((item) =>
    item.field === 'assignee' || item.fieldId === 'assignee',
  ) ?? false;

  let eventType: IntakeEvent['event_type'] | null = null;
  if (webhookEvent === 'jira:issue_created') {
    if (config.triggerOnIssueCreatedWhenAssigned === false) return null;
    eventType = 'issue_created';
  } else if (webhookEvent === 'jira:issue_updated' && assigneeChanged) {
    if (config.triggerOnAssigneeChange === false) return null;
    eventType = 'issue_assigned';
  } else {
    return null;
  }

  const occurredAt = value.timestamp
    ? new Date(value.timestamp).toISOString()
    : input.receivedAt ?? new Date().toISOString();

  const component = readSelectedValue(
    config.componentFieldId ? issue.fields[config.componentFieldId] : undefined,
  ) ?? issue.fields.components?.[0]?.name ?? null;

  const configuredWorkType = readSelectedValue(
    config.workTypeFieldId ? issue.fields[config.workTypeFieldId] : undefined,
  );
  const workType = normalizeWorkType(configuredWorkType, issue.fields.issuetype?.name);

  return {
    schema_version: 1,
    event_id: input.webhookIdentifier?.trim()
      || `${webhookEvent || 'jira'}:${issue.id ?? issue.key}:${value.timestamp ?? occurredAt}`,
    occurred_at: occurredAt,
    issue_key: issue.key,
    event_type: eventType,
    work_type: workType,
    component,
    trigger_reason: eventType === 'issue_assigned'
      ? `Jira issue assigned to configured AI SDLC assignee in ${projectKey}.`
      : `Jira issue created and assigned to configured AI SDLC assignee in ${projectKey}.`,
  };
}

function readSelectedValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const option = value as { value?: unknown; name?: unknown; key?: unknown };
  for (const candidate of [option.value, option.name, option.key]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function normalizeWorkType(value?: string | null, issueType?: string | null): WorkType | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'bug' || normalized === 'bug_fix') return 'bug';
  if (normalized === 'new_module' || normalized === 'module') return 'new_module';
  if (normalized === 'new_project' || normalized === 'project') return 'new_project';
  if (normalized === 'analysis' || normalized === 'analysis_only') return 'analysis';
  return issueType?.trim().toLowerCase() === 'bug' ? 'bug' : null;
}
