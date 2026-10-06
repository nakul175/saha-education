// Client-safe: no server imports. Allowlisted conflict codes returned by lifecycle/report routes and their plain-language text.
// Stable, non-sensitive reasons a lifecycle/report action was refused. The route returns only this
// allowlisted code (never record text); the page maps it to plain language.
export const conflictCodes = [
  'published', 'stale', 'changed', 'not_ready', 'in_published_report', 'below_saved_scores', 'reason_required',
  'request_reused', 'result_unavailable', 'result_changed', 'duplicate_assessment', 'correction_invalid', 'results_changed',
] as const;
export type ConflictCode = typeof conflictCodes[number];

export const conflictMessages: Record<ConflictCode, string> = {
  published: 'These results are published. Unpublish them first, or use the reviewed result editor to record a correction with a reason.',
  stale: 'This assessment was changed by someone else after you opened it. Reload and review the current details before saving again.',
  changed: 'The records or your access changed while saving. Reload and review the current details before trying again.',
  not_ready: 'These results are not ready to publish. Resolve every item listed under readiness, then try again.',
  in_published_report: 'A published report card includes these results. Issue and publish a corrected report first, then unpublish.',
  below_saved_scores: 'The new maximum is below a score that is already saved. Correct those scores first or choose a higher maximum.',
  reason_required: 'Saved results exist for this assessment, so a reason of at least 10 characters is required for the change.',
  request_reused: 'This request identifier was already used for a different change. Reload and start the change again.',
  result_unavailable: 'One of the selected assessments has no published result for this learner. Reload the list and choose again.',
  result_changed: 'A selected result, its publication or its assessment details changed after the list loaded. Reload the list and choose again.',
  duplicate_assessment: 'An assessment was selected twice. Reload the list and choose each assessment once.',
  correction_invalid: 'The report being corrected is not a published, current report for this learner. Reload and choose the latest published report.',
  results_changed: 'Results in this report changed after it was compiled, or are no longer published. Compile a replacement report from the current published results.',
};
