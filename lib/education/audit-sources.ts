// Plain-language names for each audit area. Kept free of server imports so the
// administrator's audit page can show the same labels as the API.
export const AUDIT_SOURCES = {
  account: 'Accounts and access', 'profile-link': 'Profile and login links', registry: 'New student and guardian records',
  attendance: 'Attendance corrections', assessment: 'Assessment result corrections', 'reading-correction': 'Reading corrections',
  report: 'Report card publication', 'submission-window': 'Submission windows', feedback: 'Learner feedback',
  'reading-import': 'Reading imports', 'resource-approval': 'Resource approvals', 'curriculum-approval': 'Curriculum approvals',
  notice: 'Notices sent', 'audit-note': 'Audit correction notes',
} as const;
export type AuditSource = keyof typeof AUDIT_SOURCES;
