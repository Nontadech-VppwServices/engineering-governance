export type Role = 'viewer' | 'requester' | 'approver' | 'deployer' | 'admin';
export type ActionType = 'create_requirement' | 'update_requirement' | 'approve_plan' | 'execute_plan' | 'provide_information' | 'request_merge' | 'request_deployment' | 'request_rollback' | 'cancel_job' | 'retry_job';
export interface Identity { line_user_id: string; jira_account_id: string; github_login: string; roles: Role[]; }
export interface LinePrincipal extends Identity { source_type: 'user' | 'group' | 'room'; direct_message: boolean; issued_at: string; expires_at: string; }
export interface PendingAction { schema_version: 1; action_id: string; idempotency_key: string; type: ActionType; payload: Record<string, unknown>; requested_by: string; status: 'DRAFT' | 'CONFIRMED' | 'EXECUTED' | 'FAILED' | 'EXPIRED'; expires_at: string; created_at: string; confirmed_at: string | null; result: unknown; }
