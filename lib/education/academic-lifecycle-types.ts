// Client-safe shapes for the reviewed course/class/enrolment lifecycle API (FR-07/FR-08). No server imports.

export type ChangeKind =
  | 'course.create' | 'course.edit' | 'course.retire' | 'course.reinstate'
  | 'class.create' | 'class.edit' | 'class.teacher' | 'class.close' | 'class.reopen'
  | 'enrolment.enrol' | 'enrolment.withdraw' | 'enrolment.complete' | 'enrolment.reenrol' | 'enrolment.transfer';

export type ChangeInput =
  | { kind: 'course.create'; code: string; title: string; description?: string | null; gradeLevel: string }
  | { kind: 'course.edit'; courseId: string; expectedUpdatedAt: string; code: string; title: string; description?: string | null; gradeLevel: string }
  | { kind: 'course.retire' | 'course.reinstate'; courseId: string; expectedUpdatedAt: string }
  | { kind: 'class.create'; courseId: string; teacherId: string; name: string; term: string; schedule?: string | null; capacity?: number | null; startsOn?: string | null; endsOn?: string | null }
  | { kind: 'class.edit'; classId: string; expectedUpdatedAt: string; courseId: string; name: string; term: string; schedule?: string | null; capacity?: number | null; startsOn?: string | null; endsOn?: string | null }
  | { kind: 'class.teacher'; classId: string; expectedUpdatedAt: string; teacherId: string }
  | { kind: 'class.close'; classId: string; expectedUpdatedAt: string; completeActive?: boolean }
  | { kind: 'class.reopen'; classId: string; expectedUpdatedAt: string }
  | { kind: 'enrolment.enrol'; studentId: string; classId: string; effectiveOn: string }
  | { kind: 'enrolment.withdraw' | 'enrolment.complete' | 'enrolment.reenrol'; enrolmentId: string; expectedUpdatedAt: string; effectiveOn: string }
  | { kind: 'enrolment.transfer'; enrolmentId: string; expectedUpdatedAt: string; toClassId: string; effectiveOn: string };

export type ChangeRequest = { clientRequestId: string; reason?: string; changes: ChangeInput[] };

export type ReceiptItem = {
  id: string; seq: number; kind: ChangeKind; subjectId: string; classId: string | null; relatedClassId: string | null;
  studentId: string | null; effectiveOn: string | null; label: string; payload: Record<string, unknown>; createdAt: string;
};
export type ChangeReceipt = { id: string; schoolId: string; createdBy: string; reason: string | null; createdAt: string; items: ReceiptItem[] };
export type ChangeResult = { receipt: ChangeReceipt; replayed: boolean };

export type ClassLifecycle = {
  id: string; name: string; term: string; schedule: string | null; updatedAt: string;
  courseId: string; courseTitle: string | null; courseCode: string | null; courseStatus: 'active' | 'retired';
  teacher: { id: string; name: string } | null;
  settings: { capacity: number | null; startsOn: string | null; endsOn: string | null; status: 'open' | 'closed'; closedAt: string | null };
  /** Staff only; families never receive roster counts. */
  activeCount: number | null;
  canManage: boolean;
  asOf: string;
};
export type CourseLifecycle = {
  id: string; code: string; title: string; description: string | null; gradeLevel: string; updatedAt: string;
  status: 'active' | 'retired'; statusChangedAt: string | null; statusReason: string | null; classCount: number | null; canManage: boolean; asOf: string;
};
export type RosterRow = {
  enrolmentId: string; studentId: string; firstName: string; lastName: string; admissionNumber: string; gradeLevel: string;
  status: 'active' | 'withdrawn' | 'completed'; startedOn: string | null; endedOn: string | null; endKind: 'withdrawn' | 'completed' | 'transferred' | null; updatedAt: string;
};
export type HistoryEvent = {
  id: string; requestId: string; kind: ChangeKind; effectiveOn: string | null; createdAt: string; label: string;
  /** Administrator only. */
  reason: string | null; actorName: string | null;
};
export type StudentEnrolmentView = {
  enrolmentId: string; classId: string; className: string; term: string; courseTitle: string | null;
  status: 'active' | 'withdrawn' | 'completed'; startedOn: string | null; endedOn: string | null; endKind: string | null;
};
export type StudentHistory = {
  student: { id: string; name: string }; enrolments: StudentEnrolmentView[]; events: HistoryEvent[];
  limit: number; truncated: boolean; asOf: string;
};

/** Plain-language text for a stable server conflict code. */
export const CONFLICT_MESSAGES: Record<string, string> = {
  stale: 'This record changed since you opened it. Reload the page and review the current details before trying again.',
  'not-found': 'That record is no longer available.',
  authority: 'Your administrator access changed. Sign in again and reload before trying again.',
  'invalid-request': 'The request could not be accepted. Reload and try again.',
  'invalid-input': 'One of the entered values is not allowed. Check the form and try again.',
  'invalid-capacity': 'Capacity must be a whole number from 1 to 500, or left blank for no limit.',
  'invalid-dates': 'Start and end dates must be real calendar dates, with the start on or before the end.',
  'capacity-below-active': 'Capacity cannot be lower than the number of learners currently enrolled.',
  'class-closed': 'This class is closed. Reopen it before changing its roster or settings.',
  'not-closed': 'This class is not closed.',
  'class-full': 'This class is full. Raise its capacity or choose another class.',
  'class-unavailable': 'That class is not available in your school.',
  'student-unavailable': 'That learner is not available in your school.',
  'already-enrolled': 'This learner already has an enrolment record for the class. Use re-enrol for a withdrawn learner.',
  'already-active': 'This learner is already active in the class.',
  'not-active': 'Only an active enrolment can be withdrawn, completed or transferred.',
  'not-withdrawn': 'Only a withdrawn enrolment can be re-enrolled.',
  'target-completed': 'The learner already completed the destination class.',
  'same-class': 'Choose a different destination class.',
  'ambiguous-legacy-pair': 'The destination class has more than one saved record for this learner. Ask an administrator to review them first.',
  'date-invalid': 'Enter a real calendar date.',
  'date-in-future': 'That date is in the future. Withdrawals and completions cannot be dated ahead; enrolment may be dated ahead only up to the class start date.',
  'date-before-start': 'The date is earlier than the date this enrolment started.',
  'date-before-end': 'The date is earlier than the date this enrolment ended.',
  'date-before-class-start': 'The date is before the class start date.',
  'date-after-class-end': 'The date is after the class end date.',
  'course-unavailable': 'That course is not available in your school.',
  'course-retired': 'That course is retired. Reinstate it, or choose an active course.',
  'already-retired': 'This course is already retired.',
  'not-retired': 'This course is not retired.',
  'course-code-taken': 'That course code is already in use. Course codes are unique across the whole system.',
  'teacher-unavailable': 'That teacher account is not available in your school.',
  'teacher-unchanged': 'That teacher is already assigned to the class.',
  'teacher-required': 'A class always needs a teacher. Assign another teacher instead of removing this one.',
  'no-change': 'Nothing was changed.',
  'request-id-reused': 'This request identifier was already used for a different change.',
  'duplicate-subject': 'A single request cannot change the same record twice.',
  'reason-required': 'Enter a reason of at least 5 characters.',
};
export const conflictMessage = (code: unknown): string =>
  typeof code === 'string' && CONFLICT_MESSAGES[code] ? CONFLICT_MESSAGES[code] : 'The change conflicts with the current records. Reload and review them before trying again.';
