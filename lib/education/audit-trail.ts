import { z } from 'zod';
import { and, desc, eq, inArray, isNotNull, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from '@/db';
import { assessments, classes, reportCards, readingChecks, resourceAssignments, resourceVersions, students, teachingResources, users } from '@/db/schema';
import { assessmentReviewEntries, assessmentReviews } from '@/db/assessment-reviews-schema';
import { attendanceReviewEntries, attendanceReviews } from '@/db/attendance-reviews-schema';
import { auditAnnotations } from '@/db/audit-annotation-schema';
import { curriculumReferenceVersions, curriculumReferences } from '@/db/curriculum-schema';
import { identityAdminEvents } from '@/db/identity-admin-schema';
import { notices } from '@/db/notices-schema';
import { profileLinkEvents } from '@/db/profile-links-schema';
import { readingCorrections } from '@/db/reading-correction-schema';
import { readingImportDrafts, readingImportItems, readingImportReceipts } from '@/db/reading-import-schema';
import { registryCreationReceipts } from '@/db/registry-create-schema';
import { reportPublicationReceipts } from '@/db/report-publication-schema';
import { assignmentSubmissionWindows } from '@/db/submission-window-schema';
import { submissionAttempts, submissionFeedback } from '@/db/submission-schema';
import { AccessError, assertAdmin, livePrincipalScope } from './access';
import { digest } from './identity';
import { AUDIT_SOURCES, type AuditSource } from './audit-sources';
import type { Principal } from './types';

// One read-only, school-scoped timeline over the evidence tables that already
// record who did what and when. It never writes to those tables; an
// administrator's reasoned correction is appended beside an entry, not into it.

export { AUDIT_SOURCES, type AuditSource };
const sourceKeys = Object.keys(AUDIT_SOURCES) as [AuditSource, ...AuditSource[]];
export const auditSourceSchema = z.enum(sourceKeys);
const identifier = z.string().min(1).max(200).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value));
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value + 'T00:00:00.000Z'); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value); }, 'Real date');
export const auditQuerySchema = z.object({
  source: auditSourceSchema.optional(), actorId: identifier.optional(), from: calendarDay.optional(), to: calendarDay.optional(),
  q: z.string().trim().min(1).max(60).refine(value => !/[\x00-\x1f\x7f]/.test(value)).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(), cursor: z.string().max(400).regex(/^[^|]{1,40}\|[^|]{1,40}\|[^|]{1,200}$/).optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, 'Start date is after end date');
export type AuditQuery = z.infer<typeof auditQuerySchema>;
type Filters = Omit<AuditQuery, 'limit'> & { id?: string };

export type AuditEntry = {
  id: string; source: AuditSource; sourceLabel: string; sourceId: string; action: string; occurredAt: string;
  actor: { id: string; name: string; role: string } | null; subject: string; reason: string | null;
  before: string | null; after: string | null; noteCount: number;
};
export type AuditChange = { label: string; before: string; after: string };
export type AuditNote = { id: string; note: string; notedBy: string; notedByName: string; createdAt: string };
export type AuditEntryDetail = AuditEntry & { changes: AuditChange[]; changesTruncated: boolean; notes: AuditNote[] };
export type AuditPage = { items: AuditEntry[]; nextCursor: string | null };
type Raw = Omit<AuditEntry, 'sourceLabel' | 'noteCount' | 'id'> & { sourceId: string };

const actor = alias(users, 'audit_actor');
const subjectUser = alias(users, 'audit_subject_user');
const previousUser = alias(users, 'audit_previous_user');
const clean = (value: string | null | undefined, max = 80) => { const text = (value ?? '').replace(/\s+/g, ' ').trim(); return text.length > max ? text.slice(0, max - 1) + '…' : text; };
const actorOf = (id: string | null, name: string | null, role: string | null) => id && name ? { id, name, role: role ?? '' } : null;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Shared filter, date window and keyset cursor for every source. Sources are
// merged newest first, ties broken by source key then row id (both descending).
function window(f: Filters, key: AuditSource, c: { time: AnyColumn | SQL; id: AnyColumn; actorId: AnyColumn | SQL; actorName: AnyColumn | SQL; subject: AnyColumn | SQL; reason: AnyColumn | SQL }): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.from) parts.push(sql`${c.time} >= ${f.from + 'T00:00:00.000Z'}`);
  if (f.to) parts.push(sql`${c.time} <= ${f.to + 'T23:59:59.999Z'}`);
  if (f.actorId) parts.push(sql`${c.actorId} = ${f.actorId}`);
  if (f.id) parts.push(sql`${c.id} = ${f.id}`);
  if (f.q) {
    const like = '%' + f.q.replace(/[\\%_]/g, match => '\\' + match) + '%';
    parts.push(sql`(${c.subject} like ${like} escape '\\' or coalesce(${c.reason}, '') like ${like} escape '\\' or ${c.actorName} like ${like} escape '\\')`);
  }
  if (f.cursor) {
    const [time, source, id] = f.cursor.split('|') as [string, string, string];
    const tie = key < source ? sql`${c.time} = ${time}` : key === source ? sql`${c.time} = ${time} and ${c.id} < ${id}` : sql`1 = 0`;
    parts.push(sql`(${c.time} < ${time} or (${tie}))`);
  }
  return and(...parts);
}

type Fetcher = (principal: Principal, f: Filters, limit: number) => Promise<Raw[]>;
const school = (principal: Principal) => principal.schoolId!;

const fetchers: Record<AuditSource, Fetcher> = {
  async account(principal, f, limit) {
    const rows = await getDb().select({ id: identityAdminEvents.id, at: identityAdminEvents.reviewedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      action: identityAdminEvents.action, target: subjectUser.name, targetRole: subjectUser.role, reason: identityAdminEvents.reason,
      previous: identityAdminEvents.previousEnabled, next: identityAdminEvents.nextEnabled })
      .from(identityAdminEvents).innerJoin(actor, eq(actor.id, identityAdminEvents.actorId)).innerJoin(subjectUser, eq(subjectUser.id, identityAdminEvents.userId))
      .where(and(eq(identityAdminEvents.schoolId, school(principal)), window(f, 'account', { time: identityAdminEvents.reviewedAt, id: identityAdminEvents.id, actorId: identityAdminEvents.actorId,
        actorName: actor.name, subject: subjectUser.name, reason: identityAdminEvents.reason })))
      .orderBy(desc(identityAdminEvents.reviewedAt), desc(identityAdminEvents.id)).limit(limit);
    const state = (value: number | null) => value === null ? 'No account yet' : value === 1 ? 'Access enabled' : 'Access disabled';
    return rows.map(r => ({ source: 'account', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole),
      action: r.action === 'provision' ? 'Account created' : r.action === 'enable' ? 'Account enabled' : 'Account disabled', subject: `${r.target} (${r.targetRole})`,
      reason: r.reason, before: state(r.previous), after: state(r.next) }));
  },
  async 'profile-link'(principal, f, limit) {
    const nextUser = alias(users, 'audit_next_user');
    const profileName = sql<string>`case ${profileLinkEvents.profileType} when 'student' then (select students.first_name || ' ' || students.last_name from students where students.id = ${profileLinkEvents.profileId})
      else (select guardians.name from guardians where guardians.id = ${profileLinkEvents.profileId}) end`;
    const rows = await getDb().select({ id: profileLinkEvents.id, at: profileLinkEvents.reviewedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      type: profileLinkEvents.profileType, name: profileName, reason: profileLinkEvents.reason, hadPrevious: profileLinkEvents.previousUserId, hasNext: profileLinkEvents.nextUserId,
      previousName: previousUser.name, nextName: nextUser.name })
      .from(profileLinkEvents).innerJoin(actor, eq(actor.id, profileLinkEvents.actorId))
      .leftJoin(previousUser, eq(previousUser.id, profileLinkEvents.previousUserId)).leftJoin(nextUser, eq(nextUser.id, profileLinkEvents.nextUserId))
      .where(and(eq(profileLinkEvents.schoolId, school(principal)),
        sql`((${profileLinkEvents.profileType} = 'student' AND EXISTS (SELECT 1 FROM students profile_target WHERE profile_target.id = ${profileLinkEvents.profileId} AND profile_target.school_id = ${school(principal)})) OR
          (${profileLinkEvents.profileType} = 'guardian' AND EXISTS (SELECT 1 FROM guardians profile_target WHERE profile_target.id = ${profileLinkEvents.profileId} AND profile_target.school_id = ${school(principal)})))`,
        window(f, 'profile-link', { time: profileLinkEvents.reviewedAt, id: profileLinkEvents.id, actorId: profileLinkEvents.actorId, actorName: actor.name, subject: profileName, reason: profileLinkEvents.reason })))
      .orderBy(desc(profileLinkEvents.reviewedAt), desc(profileLinkEvents.id)).limit(limit);
    return rows.map(r => ({ source: 'profile-link', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole),
      action: !r.hasNext ? 'Login removed from profile' : !r.hadPrevious ? 'Login linked to profile' : 'Login changed on profile', subject: `${r.name ?? 'Profile'} (${r.type})`,
      reason: r.reason, before: r.previousName ?? 'No login', after: r.nextName ?? 'No login' }));
  },
  async registry(principal, f, limit) {
    const name = sql<string>`case ${registryCreationReceipts.kind} when 'student' then json_extract(${registryCreationReceipts.profileSnapshot}, '$.firstName') || ' ' || json_extract(${registryCreationReceipts.profileSnapshot}, '$.lastName')
      else json_extract(${registryCreationReceipts.profileSnapshot}, '$.name') end`;
    const rows = await getDb().select({ id: registryCreationReceipts.id, at: registryCreationReceipts.createdAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      kind: registryCreationReceipts.kind, name, reason: registryCreationReceipts.reason })
      .from(registryCreationReceipts).innerJoin(actor, eq(actor.id, registryCreationReceipts.createdBy))
      .where(and(eq(registryCreationReceipts.schoolId, school(principal)), window(f, 'registry', { time: registryCreationReceipts.createdAt, id: registryCreationReceipts.id,
        actorId: registryCreationReceipts.createdBy, actorName: actor.name, subject: name, reason: registryCreationReceipts.reason })))
      .orderBy(desc(registryCreationReceipts.createdAt), desc(registryCreationReceipts.id)).limit(limit);
    return rows.map(r => ({ source: 'registry', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole),
      action: r.kind === 'student' ? 'Student record created' : 'Guardian record created', subject: clean(r.name, 120) || 'New record', reason: r.reason,
      before: 'No record', after: 'New record, not yet linked to a login' }));
  },
  async attendance(principal, f, limit) {
    const subject = sql<string>`${classes.name} || ', ' || ${attendanceReviews.attendanceDate}`;
    const rows = await getDb().select({ id: attendanceReviews.id, at: attendanceReviews.createdAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      subject, reason: attendanceReviews.reason,
      total: sql<number>`(select count(*) from attendance_review_entries where review_id = ${attendanceReviews.id})`,
      fresh: sql<number>`(select count(*) from attendance_review_entries where review_id = ${attendanceReviews.id} and before_record is null)` })
      .from(attendanceReviews).innerJoin(actor, eq(actor.id, attendanceReviews.reviewedBy)).innerJoin(classes, eq(classes.id, attendanceReviews.classId))
      .where(and(eq(attendanceReviews.schoolId, school(principal)),
        sql`not exists (select 1 from attendance_review_entries e join students s on s.id = e.student_id where e.review_id = ${attendanceReviews.id} and s.school_id <> ${attendanceReviews.schoolId})`,
        window(f, 'attendance', { time: attendanceReviews.createdAt, id: attendanceReviews.id, actorId: attendanceReviews.reviewedBy, actorName: actor.name, subject, reason: attendanceReviews.reason })))
      .orderBy(desc(attendanceReviews.createdAt), desc(attendanceReviews.id)).limit(limit);
    return rows.map(r => ({ source: 'attendance', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Attendance reviewed and saved',
      subject: r.subject, reason: r.reason, before: Number(r.total) - Number(r.fresh) > 0 ? `${plural(Number(r.total) - Number(r.fresh), 'earlier record')} kept in history` : 'No earlier record',
      after: `${plural(Number(r.total), 'pupil record')} saved (${Number(r.fresh)} new)` }));
  },
  async assessment(principal, f, limit) {
    const subject = sql<string>`${assessments.title} || ' (' || ${classes.name} || ')'`;
    const rows = await getDb().select({ id: assessmentReviews.id, at: assessmentReviews.createdAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      subject, reason: assessmentReviews.reason,
      total: sql<number>`(select count(*) from assessment_review_entries where review_id = ${assessmentReviews.id})`,
      fresh: sql<number>`(select count(*) from assessment_review_entries where review_id = ${assessmentReviews.id} and before_record is null)` })
      .from(assessmentReviews).innerJoin(actor, eq(actor.id, assessmentReviews.reviewedBy)).innerJoin(assessments, eq(assessments.id, assessmentReviews.assessmentId))
      .innerJoin(classes, eq(classes.id, assessmentReviews.classId))
      .where(and(eq(assessmentReviews.schoolId, school(principal)),
        sql`not exists (select 1 from assessment_review_entries e join students s on s.id = e.student_id where e.review_id = ${assessmentReviews.id} and s.school_id <> ${assessmentReviews.schoolId})`,
        window(f, 'assessment', { time: assessmentReviews.createdAt, id: assessmentReviews.id, actorId: assessmentReviews.reviewedBy, actorName: actor.name, subject, reason: assessmentReviews.reason })))
      .orderBy(desc(assessmentReviews.createdAt), desc(assessmentReviews.id)).limit(limit);
    return rows.map(r => ({ source: 'assessment', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Assessment results reviewed and saved',
      subject: r.subject, reason: r.reason, before: Number(r.total) - Number(r.fresh) > 0 ? `${plural(Number(r.total) - Number(r.fresh), 'earlier result')} kept in history` : 'No earlier result',
      after: `${plural(Number(r.total), 'pupil result')} saved (${Number(r.fresh)} new)` }));
  },
  async 'reading-correction'(principal, f, limit) {
    const earlier = alias(readingCorrections, 'earlier_correction');
    const subject = sql<string>`${students.firstName} || ' ' || ${students.lastName} || ', ' || ${readingChecks.passageReference}`;
    const rows = await getDb().select({ id: readingCorrections.id, at: readingCorrections.correctedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      subject, reason: readingCorrections.reason, revision: readingCorrections.revision, correct: readingCorrections.wordsCorrect, attempted: readingCorrections.wordsAttempted,
      priorCorrect: sql<number>`coalesce(${earlier.wordsCorrect}, ${readingChecks.wordsCorrect})`, priorAttempted: sql<number>`coalesce(${earlier.wordsAttempted}, ${readingChecks.wordsAttempted})` })
      .from(readingCorrections).innerJoin(actor, eq(actor.id, readingCorrections.correctedBy)).innerJoin(readingChecks, eq(readingChecks.id, readingCorrections.readingCheckId))
      .innerJoin(students, eq(students.id, readingChecks.studentId))
      .leftJoin(earlier, and(eq(earlier.readingCheckId, readingCorrections.readingCheckId), sql`${earlier.revision} = ${readingCorrections.revision} - 1`))
      .where(and(eq(readingChecks.schoolId, school(principal)), eq(students.schoolId, school(principal)),
        window(f, 'reading-correction', { time: readingCorrections.correctedAt, id: readingCorrections.id, actorId: readingCorrections.correctedBy, actorName: actor.name, subject, reason: readingCorrections.reason })))
      .orderBy(desc(readingCorrections.correctedAt), desc(readingCorrections.id)).limit(limit);
    return rows.map(r => ({ source: 'reading-correction', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: `Reading corrected (revision ${r.revision})`,
      subject: r.subject, reason: r.reason, before: `${r.priorCorrect} of ${r.priorAttempted} words correct`, after: `${r.correct} of ${r.attempted} words correct` }));
  },
  async report(principal, f, limit) {
    const subject = sql<string>`${students.firstName} || ' ' || ${students.lastName} || ', ' || ${reportCards.term}`;
    const rows = await getDb().select({ id: reportPublicationReceipts.id, at: reportPublicationReceipts.publishedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role, subject })
      .from(reportPublicationReceipts).innerJoin(actor, eq(actor.id, reportPublicationReceipts.publishedBy)).innerJoin(reportCards, eq(reportCards.id, reportPublicationReceipts.reportId))
      .innerJoin(students, eq(students.id, reportPublicationReceipts.studentId))
      .where(and(eq(reportPublicationReceipts.schoolId, school(principal)), eq(students.schoolId, school(principal)),
        window(f, 'report', { time: reportPublicationReceipts.publishedAt, id: reportPublicationReceipts.id, actorId: reportPublicationReceipts.publishedBy, actorName: actor.name, subject, reason: sql`''` })))
      .orderBy(desc(reportPublicationReceipts.publishedAt), desc(reportPublicationReceipts.id)).limit(limit);
    return rows.map(r => ({ source: 'report', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Report card published', subject: r.subject,
      reason: null, before: 'Draft, not visible to families', after: 'Visible to linked guardians and the learner' }));
  },
  async 'submission-window'(principal, f, limit) {
    const earlier = alias(assignmentSubmissionWindows, 'earlier_window');
    const subject = sql<string>`${resourceVersions.title} || ' (' || ${classes.name} || ')'`;
    const rows = await getDb().select({ id: assignmentSubmissionWindows.id, at: assignmentSubmissionWindows.reviewedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      subject, reason: assignmentSubmissionWindows.reason, state: assignmentSubmissionWindows.state, closes: assignmentSubmissionWindows.closesAt,
      priorState: earlier.state, priorCloses: earlier.closesAt, revision: assignmentSubmissionWindows.revision })
      .from(assignmentSubmissionWindows).innerJoin(actor, eq(actor.id, assignmentSubmissionWindows.reviewedBy))
      .innerJoin(resourceAssignments, eq(resourceAssignments.id, assignmentSubmissionWindows.assignmentId)).innerJoin(classes, eq(classes.id, resourceAssignments.classId))
      .innerJoin(resourceVersions, eq(resourceVersions.id, resourceAssignments.versionId))
      .leftJoin(earlier, and(eq(earlier.assignmentId, assignmentSubmissionWindows.assignmentId), sql`${earlier.revision} = ${assignmentSubmissionWindows.revision} - 1`))
      .where(and(eq(classes.schoolId, school(principal)),
        window(f, 'submission-window', { time: assignmentSubmissionWindows.reviewedAt, id: assignmentSubmissionWindows.id, actorId: assignmentSubmissionWindows.reviewedBy, actorName: actor.name, subject, reason: assignmentSubmissionWindows.reason })))
      .orderBy(desc(assignmentSubmissionWindows.reviewedAt), desc(assignmentSubmissionWindows.id)).limit(limit);
    const text = (state: string | null, closes: string | null) => state === null ? 'No window (open)' : state === 'open' ? 'Open' : closes ? `Closed from ${closes}` : 'Closed';
    return rows.map(r => ({ source: 'submission-window', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: `Submission window set to ${r.state}`,
      subject: r.subject, reason: r.reason, before: text(r.priorState, r.priorCloses), after: text(r.state, r.closes) }));
  },
  async feedback(principal, f, limit) {
    const subject = sql<string>`${students.firstName} || ' ' || ${students.lastName} || ', ' || ${classes.name}`;
    const rows = await getDb().select({ id: submissionFeedback.id, at: submissionFeedback.reviewedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      subject, revision: submissionFeedback.revision })
      .from(submissionFeedback).innerJoin(actor, eq(actor.id, submissionFeedback.reviewedBy)).innerJoin(submissionAttempts, eq(submissionAttempts.id, submissionFeedback.submissionId))
      .innerJoin(students, eq(students.id, submissionAttempts.studentId)).innerJoin(resourceAssignments, eq(resourceAssignments.id, submissionAttempts.assignmentId))
      .innerJoin(classes, eq(classes.id, resourceAssignments.classId))
      .where(and(eq(classes.schoolId, school(principal)), eq(students.schoolId, school(principal)),
        window(f, 'feedback', { time: submissionFeedback.reviewedAt, id: submissionFeedback.id, actorId: submissionFeedback.reviewedBy, actorName: actor.name, subject, reason: sql`''` })))
      .orderBy(desc(submissionFeedback.reviewedAt), desc(submissionFeedback.id)).limit(limit);
    return rows.map(r => ({ source: 'feedback', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: `Feedback saved (revision ${r.revision})`, subject: r.subject,
      reason: null, before: r.revision > 1 ? `Revision ${r.revision - 1} kept` : 'No earlier feedback', after: 'Feedback text is not repeated in the audit trail' }));
  },
  async 'reading-import'(principal, f, limit) {
    const subject = sql<string>`${readingImportReceipts.sourceLabel} || ' / ' || ${readingImportReceipts.externalReference}`;
    const rows = await getDb().select({ id: readingImportReceipts.itemId, at: readingImportReceipts.reviewedAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role, subject, reason: readingImportDrafts.reason })
      .from(readingImportReceipts).innerJoin(actor, eq(actor.id, readingImportReceipts.reviewedBy)).innerJoin(readingImportItems, eq(readingImportItems.id, readingImportReceipts.itemId))
      .innerJoin(readingImportDrafts, eq(readingImportDrafts.id, readingImportItems.importId)).innerJoin(students, eq(students.id, readingImportItems.studentId))
      .where(and(eq(readingImportReceipts.schoolId, school(principal)), eq(students.schoolId, school(principal)),
        window(f, 'reading-import', { time: readingImportReceipts.reviewedAt, id: readingImportReceipts.itemId, actorId: readingImportReceipts.reviewedBy, actorName: actor.name, subject, reason: readingImportDrafts.reason })))
      .orderBy(desc(readingImportReceipts.reviewedAt), desc(readingImportReceipts.itemId)).limit(limit);
    return rows.map(r => ({ source: 'reading-import', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Imported reading confirmed', subject: r.subject,
      reason: r.reason, before: 'Staged, not yet a reading', after: 'Saved as a reading record' }));
  },
  async 'resource-approval'(principal, f, limit) {
    const subject = sql<string>`${resourceVersions.title} || ' (version ' || ${resourceVersions.version} || ')'`;
    const rows = await getDb().select({ id: resourceVersions.id, at: sql<string>`${resourceVersions.approvedAt}`, actorId: actor.id, actorName: actor.name, actorRole: actor.role, subject })
      .from(resourceVersions).innerJoin(teachingResources, eq(teachingResources.id, resourceVersions.resourceId)).innerJoin(actor, eq(actor.id, resourceVersions.approvedBy))
      .where(and(eq(teachingResources.schoolId, school(principal)), isNotNull(resourceVersions.approvedAt),
        window(f, 'resource-approval', { time: sql`${resourceVersions.approvedAt}`, id: resourceVersions.id, actorId: resourceVersions.approvedBy, actorName: actor.name, subject, reason: sql`''` })))
      .orderBy(desc(resourceVersions.approvedAt), desc(resourceVersions.id)).limit(limit);
    return rows.map(r => ({ source: 'resource-approval', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Resource version approved', subject: r.subject,
      reason: null, before: 'Draft', after: 'Approved for assignment' }));
  },
  async 'curriculum-approval'(principal, f, limit) {
    const subject = sql<string>`${curriculumReferenceVersions.title} || ' (version ' || ${curriculumReferenceVersions.version} || ')'`;
    const rows = await getDb().select({ id: curriculumReferenceVersions.id, at: sql<string>`${curriculumReferenceVersions.approvedAt}`, actorId: actor.id, actorName: actor.name, actorRole: actor.role, subject })
      .from(curriculumReferenceVersions).innerJoin(curriculumReferences, eq(curriculumReferences.id, curriculumReferenceVersions.referenceId)).innerJoin(actor, eq(actor.id, curriculumReferenceVersions.approvedBy))
      .where(and(eq(curriculumReferences.schoolId, school(principal)), isNotNull(curriculumReferenceVersions.approvedAt),
        window(f, 'curriculum-approval', { time: sql`${curriculumReferenceVersions.approvedAt}`, id: curriculumReferenceVersions.id, actorId: curriculumReferenceVersions.approvedBy, actorName: actor.name, subject, reason: sql`''` })))
      .orderBy(desc(curriculumReferenceVersions.approvedAt), desc(curriculumReferenceVersions.id)).limit(limit);
    return rows.map(r => ({ source: 'curriculum-approval', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Curriculum version approved', subject: r.subject,
      reason: null, before: 'Draft', after: 'Approved for copying' }));
  },
  async notice(principal, f, limit) {
    const rows = await getDb().select({ id: notices.id, at: notices.createdAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role, title: notices.title, reason: notices.correctionReason,
      kind: notices.audienceKind, label: notices.audienceLabel, count: notices.recipientCount })
      .from(notices).innerJoin(actor, eq(actor.id, notices.authorId))
      .where(and(eq(notices.schoolId, school(principal)), window(f, 'notice', { time: notices.createdAt, id: notices.id, actorId: notices.authorId, actorName: actor.name, subject: notices.title, reason: notices.correctionReason })))
      .orderBy(desc(notices.createdAt), desc(notices.id)).limit(limit);
    return rows.map(r => ({ source: 'notice', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: r.kind === 'correction' ? 'Notice correction sent' : 'Notice sent',
      subject: clean(r.title, 120), reason: r.reason, before: r.kind === 'correction' ? 'Original notice kept unchanged' : 'No notice', after: `${plural(Number(r.count), 'recipient')}: ${r.label}` }));
  },
  async 'audit-note'(principal, f, limit) {
    const rows = await getDb().select({ id: auditAnnotations.id, at: auditAnnotations.createdAt, actorId: actor.id, actorName: actor.name, actorRole: actor.role, source: auditAnnotations.source, note: auditAnnotations.note })
      .from(auditAnnotations).innerJoin(actor, eq(actor.id, auditAnnotations.notedBy))
      .where(and(eq(auditAnnotations.schoolId, school(principal)), window(f, 'audit-note', { time: auditAnnotations.createdAt, id: auditAnnotations.id, actorId: auditAnnotations.notedBy, actorName: actor.name,
        subject: auditAnnotations.source, reason: auditAnnotations.note })))
      .orderBy(desc(auditAnnotations.createdAt), desc(auditAnnotations.id)).limit(limit);
    return rows.map(r => ({ source: 'audit-note', sourceId: r.id, occurredAt: r.at, actor: actorOf(r.actorId, r.actorName, r.actorRole), action: 'Correction note added to an audit entry',
      subject: (AUDIT_SOURCES as Record<string, string>)[r.source] ?? r.source, reason: r.note, before: 'Original entry kept unchanged', after: 'Reasoned correction recorded beside it' }));
  },
};

async function liveAdmin(principal: Principal): Promise<void> {
  assertAdmin(principal);
  const [row] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, principal.id), eq(users.role, 'admin'), eq(users.schoolId, school(principal)), livePrincipalScope(principal))).limit(1);
  if (!row) throw new AccessError('Administrator access required');
}
async function noteCounts(principal: Principal, entries: Raw[]): Promise<Map<string, number>> {
  const keys = entries.map(entry => `${entry.source}|${entry.sourceId}`);
  if (!keys.length) return new Map();
  const rows = await getDb().select({ key: sql<string>`${auditAnnotations.source} || '|' || ${auditAnnotations.sourceId}`, n: sql<number>`count(*)` }).from(auditAnnotations)
    .where(and(eq(auditAnnotations.schoolId, school(principal)), inArray(sql`${auditAnnotations.source} || '|' || ${auditAnnotations.sourceId}`, keys)))
    .groupBy(auditAnnotations.source, auditAnnotations.sourceId);
  return new Map(rows.map(row => [row.key, Number(row.n)]));
}
const globalOrder = (a: Raw, b: Raw) => a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : a.source < b.source ? 1 : a.source > b.source ? -1 : a.sourceId < b.sourceId ? 1 : a.sourceId > b.sourceId ? -1 : 0;
function entryView(raw: Raw, notes: Map<string, number>): AuditEntry {
  return { ...raw, id: `${raw.source}:${raw.sourceId}`, sourceLabel: AUDIT_SOURCES[raw.source], noteCount: notes.get(`${raw.source}|${raw.sourceId}`) ?? 0 };
}

export async function listAuditTrail(principal: Principal, value: z.input<typeof auditQuerySchema> = {}): Promise<AuditPage> {
  await liveAdmin(principal);
  const { limit = 25, ...filters } = auditQuerySchema.parse(value);
  const wanted = filters.source ? [filters.source] : sourceKeys;
  const batches = await Promise.all(wanted.map(key => fetchers[key](principal, filters, limit + 1)));
  const merged = batches.flat().sort(globalOrder), page = merged.slice(0, limit), last = page.at(-1);
  const notes = await noteCounts(principal, page);
  await liveAdmin(principal);
  return { items: page.map(raw => entryView(raw, notes)), nextCursor: merged.length > limit && last ? `${last.occurredAt}|${last.source}|${last.sourceId}` : null };
}

// ---- one entry with its field-level detail and the corrections noted beside it ----
const snapshot = (raw: string | null): Record<string, unknown> | null => { if (!raw) return null; try { const parsed: unknown = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null; } catch { return null; } };
const attendanceText = (value: Record<string, unknown> | null) => value ? `${String(value.status ?? '')}${typeof value.note === 'string' && value.note ? ` (${clean(value.note, 60)})` : ''}` : 'No earlier record';
const resultText = (value: Record<string, unknown> | null) => value ? `Score ${String(value.score ?? '')}${value.grade ? `, grade ${clean(String(value.grade), 20)}` : ''}${value.feedback ? `, feedback “${clean(String(value.feedback), 60)}”` : ''}` : 'No earlier result';

async function changesFor(principal: Principal, source: AuditSource, id: string): Promise<{ changes: AuditChange[]; truncated: boolean }> {
  if (source === 'attendance') {
    const rows = await getDb().select({ first: students.firstName, last: students.lastName, before: attendanceReviewEntries.beforeRecord, after: attendanceReviewEntries.afterRecord })
      .from(attendanceReviewEntries).innerJoin(students, eq(students.id, attendanceReviewEntries.studentId)).where(and(eq(attendanceReviewEntries.reviewId, id), eq(students.schoolId, school(principal))))
      .orderBy(students.lastName, students.firstName, students.id).limit(101);
    return { changes: rows.slice(0, 100).map(r => ({ label: `${r.first} ${r.last}`, before: attendanceText(snapshot(r.before)), after: attendanceText(snapshot(r.after)) })), truncated: rows.length > 100 };
  }
  if (source === 'assessment') {
    const rows = await getDb().select({ first: students.firstName, last: students.lastName, before: assessmentReviewEntries.beforeRecord, after: assessmentReviewEntries.afterRecord })
      .from(assessmentReviewEntries).innerJoin(students, eq(students.id, assessmentReviewEntries.studentId)).where(and(eq(assessmentReviewEntries.reviewId, id), eq(students.schoolId, school(principal))))
      .orderBy(students.lastName, students.firstName, students.id).limit(101);
    return { changes: rows.slice(0, 100).map(r => ({ label: `${r.first} ${r.last}`, before: resultText(snapshot(r.before)), after: resultText(snapshot(r.after)) })), truncated: rows.length > 100 };
  }
  return { changes: [], truncated: false };
}
const noteRows = (principal: Principal, source: AuditSource, sourceId: string) => getDb().select({ id: auditAnnotations.id, note: auditAnnotations.note, notedBy: auditAnnotations.notedBy, notedByName: users.name, createdAt: auditAnnotations.createdAt })
  .from(auditAnnotations).innerJoin(users, eq(users.id, auditAnnotations.notedBy))
  .where(and(eq(auditAnnotations.schoolId, school(principal)), eq(auditAnnotations.source, source), eq(auditAnnotations.sourceId, sourceId))).orderBy(auditAnnotations.createdAt, auditAnnotations.id).limit(100);

async function findEntry(principal: Principal, source: AuditSource, sourceId: string): Promise<Raw | null> {
  const [raw] = await fetchers[source](principal, { id: sourceId }, 1);
  return raw ?? null;
}
export async function getAuditEntry(principal: Principal, sourceValue: string, sourceIdValue: string): Promise<AuditEntryDetail> {
  await liveAdmin(principal);
  const source = auditSourceSchema.parse(sourceValue), sourceId = identifier.parse(sourceIdValue);
  const raw = await findEntry(principal, source, sourceId);
  if (!raw) { await liveAdmin(principal); throw new AccessError('Audit entry not found', 404); }
  const { changes, truncated } = await changesFor(principal, source, sourceId);
  const notes = await noteRows(principal, source, sourceId);
  await liveAdmin(principal);
  return { ...entryView(raw, new Map([[`${source}|${sourceId}`, notes.length]])), changes, changesTruncated: truncated, notes };
}

// ---- reasoned correction notes ----
export const auditNoteSchema = z.object({
  clientRequestId: z.string().uuid(), source: auditSourceSchema, sourceId: identifier,
  note: z.string().trim().min(10).max(500).refine(value => Array.from(value).length >= 10 && !/[\x00-\x1f\x7f]/.test(value) && !/<\/?[a-zA-Z!?]/.test(value), 'Plain one-line note'),
  reviewConfirmed: z.literal(true),
}).strict();
export type AuditNoteInput = z.infer<typeof auditNoteSchema>;
export class AuditNoteConflict extends AccessError {
  constructor() { super('Audit note conflict', 409); this.name = 'AuditNoteConflict'; }
}
async function savedNote(principal: Principal, id: string, hash: string): Promise<AuditNote & { source: string; sourceId: string } | null> {
  const [row] = await getDb().select({ id: auditAnnotations.id, note: auditAnnotations.note, notedBy: auditAnnotations.notedBy, notedByName: users.name, createdAt: auditAnnotations.createdAt,
    source: auditAnnotations.source, sourceId: auditAnnotations.sourceId, hash: auditAnnotations.requestHash })
    .from(auditAnnotations).innerJoin(users, eq(users.id, auditAnnotations.notedBy)).where(and(eq(auditAnnotations.id, id), eq(auditAnnotations.schoolId, school(principal)))).limit(1);
  if (!row) return null;
  if (row.notedBy !== principal.id || row.hash !== hash) throw new AuditNoteConflict();
  const { hash: _hash, ...safe } = row; void _hash;
  return safe;
}
export async function addAuditNote(principal: Principal, value: AuditNoteInput): Promise<{ note: AuditNote; entry: AuditEntryDetail; replayed: boolean }> {
  await liveAdmin(principal);
  const input = auditNoteSchema.parse(value);
  const hash = await digest(JSON.stringify({ actor: principal.id, school: principal.schoolId, input }));
  const prior = await savedNote(principal, input.clientRequestId, hash);
  if (prior) return { note: prior, entry: await getAuditEntry(principal, prior.source, prior.sourceId), replayed: true };
  if (!await findEntry(principal, input.source, input.sourceId)) { await liveAdmin(principal); throw new AccessError('Audit entry not found', 404); }
  const stamp = new Date().toISOString();
  try {
    await getDb().insert(auditAnnotations).select(getDb().select({
      id: sql<string>`${input.clientRequestId}`.as('id'), schoolId: sql<string>`${school(principal)}`.as('school_id'), source: sql<string>`${input.source}`.as('source'),
      sourceId: sql<string>`${input.sourceId}`.as('source_id'), notedBy: sql<string>`${principal.id}`.as('noted_by'), note: sql<string>`${input.note}`.as('note'),
      requestHash: sql<string>`${hash}`.as('request_hash'), createdAt: sql<string>`${stamp}`.as('created_at'),
    }).from(users).where(and(eq(users.id, principal.id), eq(users.role, 'admin'), eq(users.schoolId, school(principal)), livePrincipalScope(principal),
      sql`not exists (select 1 from audit_annotations where id = ${input.clientRequestId})`)));
  } catch (error) { if (!(error instanceof Error && /UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message + String(error.cause ?? '')))) throw error; }
  const saved = await savedNote(principal, input.clientRequestId, hash);
  if (!saved) { await liveAdmin(principal); throw new AuditNoteConflict(); }
  const entry = await getAuditEntry(principal, input.source, input.sourceId);
  return { note: saved, entry, replayed: false };
}