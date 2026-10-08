/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation preserves the verified vinext recovery behavior. */
import { redirect } from 'next/navigation';
import { BookOpen, ClipboardCheck, ArrowRight, AudioLines } from 'lucide-react';
import { getServerPrincipal } from '@/lib/education/auth';
import { getRoleDashboard } from '@/lib/education/dashboard';
import { AppShell } from '@/components/app-shell';
import { RoleGuide } from '@/components/role-guide';
import { WorkspaceHeading } from '@/components/workspace-heading';
const coverageLabels = {
  'no-current-roster': 'No current roster',
  'missing-results': 'Missing results',
  'recorded-for-current-roster': 'Results recorded for current roster',
  'needs-review': 'Result coverage needs review',
};
export default async function TeacherDashboard() {
  const principal = await getServerPrincipal();
  if (!principal || principal.role !== 'teacher') redirect('/');
  const snapshot = await getRoleDashboard(principal);
  if (!snapshot || snapshot.role !== 'teacher') redirect('/');
  const firstClass = snapshot.classes.items[0];
  const attention = snapshot.assessments.items.filter(
    (record) => record.coverage.state !== 'recorded-for-current-roster',
  );
  return (
    <AppShell principal={principal}>
      <div className="space-y-6">
        <WorkspaceHeading
          eyebrow="Your teaching workspace"
          title="Teacher Dashboard"
          description="Your classes, the next small step, and room to focus on teaching."
          action={
            <a href="/dashboard/teacher" className="saha-text-link">
              Refresh dashboard
            </a>
          }
        />
        <section className="saha-hero" aria-label="Start with a class">
          <div>
            <p className="saha-eyebrow">Start with a class</p>
            <h2>{firstClass?.name || 'Your classroom starts here'}</h2>
            <p>
              {firstClass
                ? `${firstClass.courseTitle ?? 'Assigned course'} · ${firstClass.activeStudents} active students. Open the register and review today’s attendance.`
                : 'No classes are currently assigned to you. Your school administrator can help set up your teaching classes.'}
            </p>
          </div>
          <a
            className="saha-primary-link"
            href={firstClass ? '/classes/' + encodeURIComponent(firstClass.id) + '/attendance' : '/classes'}
          >
            {firstClass ? 'Take attendance' : 'View classes'}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
        <div className="saha-dashboard-grid">
          <section className="saha-workspace-panel" aria-labelledby="my-classes-title">
            <div className="saha-panel-heading">
              <h2 id="my-classes-title">My classes</h2>
              <span>{snapshot.classes.total} assigned</span>
            </div>
            {snapshot.classes.total === 0 && (
              <p className="saha-coverage-note">No classes are currently assigned to you.</p>
            )}
            {snapshot.classes.truncated && (
              <p className="saha-coverage-note" role="status">
                Showing {snapshot.classes.items.length} of {snapshot.classes.total} assigned classes. Open{' '}
                <a href="/classes">Classes</a> for the available list.
              </p>
            )}
            {snapshot.classes.items.map((record) => (
              <article key={record.id} data-dashboard-class={record.id} className="saha-list-row">
                <BookOpen size={19} aria-hidden="true" />
                <div>
                  <h3>{record.name}</h3>
                  <p>
                    {record.courseTitle ?? 'Course details unavailable'} · {record.term}
                  </p>
                  <p>Active students: {record.activeStudents}</p>
                  <div className="saha-task-links">
                    <a href={'/classes/' + encodeURIComponent(record.id)}>Open class</a>
                    <a href={'/classes/' + encodeURIComponent(record.id) + '/attendance'}>Take attendance</a>
                  </div>
                </div>
              </article>
            ))}
          </section>
          <section className="saha-workspace-panel" aria-labelledby="attention-title">
            <div className="saha-panel-heading">
              <h2 id="attention-title">Needs your attention</h2>
              <span>{attention.length} loaded assessments</span>
            </div>
            {attention.length === 0 && (
              <div className="saha-list-row">
                <ClipboardCheck size={19} aria-hidden="true" />
                <div>
                  <h3>No result gaps in the loaded assessments</h3>
                  <p>You can open a class or prepare the next lesson.</p>
                </div>
              </div>
            )}
            {attention.slice(0, 4).map((record) => (
              <div className="saha-list-row" key={record.id}>
                <ClipboardCheck size={19} aria-hidden="true" />
                <div>
                  <h3>{record.title}</h3>
                  <p>
                    {coverageLabels[record.coverage.state]} · {record.coverage.missingStudents} missing
                  </p>
                  <a href={'/assessments/' + encodeURIComponent(record.id)}>Review results</a>
                </div>
              </div>
            ))}
            <div className="saha-list-row">
              <BookOpen size={19} aria-hidden="true" />
              <div>
                <h3>Prepare your next lesson</h3>
                <p>Create, review and share teaching resources.</p>
                <a href="/resources">Open Teaching resources</a>
              </div>
            </div>
            <div className="saha-list-row">
              <AudioLines size={19} aria-hidden="true" />
              <div>
                <h3>Reading check-ins</h3>
                <p>Review observations and plan practice.</p>
                <a href="/reading-review">Open Reading history</a>
              </div>
            </div>
          </section>
        </div>
        <section className="saha-workspace-panel" aria-labelledby="coverage-title">
          <div className="saha-panel-heading">
            <h2 id="coverage-title">Assessment result coverage</h2>
            <a className="saha-text-link" href="/assessments">
              All assessments
            </a>
          </div>
          <p className="saha-coverage-note">
            Coverage uses the current active roster and stored results. A valid score of zero counts as a
            recorded result.
          </p>
          {snapshot.assessments.total === 0 && (
            <p className="saha-coverage-note">No assessments are available for your assigned classes.</p>
          )}
          {snapshot.assessments.truncated && (
            <p className="saha-coverage-note" role="status">
              Showing {snapshot.assessments.items.length} of {snapshot.assessments.total} assessments. Open{' '}
              <a href="/assessments">Assessments</a> for the available list.
            </p>
          )}
          {snapshot.assessments.items.map((record) => (
            <article
              key={record.id}
              data-dashboard-assessment={record.id}
              data-coverage-state={record.coverage.state}
              className="saha-list-row"
            >
              <div>
                <h3>{record.title}</h3>
                <p>
                  {record.kind} · Date: {record.date} ·{' '}
                  {record.maxScore === null
                    ? 'Maximum score unavailable'
                    : 'Maximum score: ' + record.maxScore}
                </p>
                <p>
                  <strong>{coverageLabels[record.coverage.state]}</strong>
                </p>
                {record.coverage.state === 'no-current-roster' ? (
                  <p>No active students are available for result coverage.</p>
                ) : (
                  <>
                    <p>
                      Active students: {record.coverage.activeStudents}. Recorded results:{' '}
                      {record.coverage.recordedStudents}. Missing results: {record.coverage.missingStudents}.
                    </p>
                    {(record.coverage.ambiguousEnrolmentStudents > 0 ||
                      record.coverage.ambiguousResultStudents > 0 ||
                      record.coverage.invalidResultStudents > 0 ||
                      record.coverage.invalidMaximum) && (
                      <div role="status">
                        <p>
                          {record.coverage.ambiguousEnrolmentStudents > 0 && (
                            <>
                              Students with multiple enrolment records:{' '}
                              {record.coverage.ambiguousEnrolmentStudents}.{' '}
                            </>
                          )}
                          {record.coverage.ambiguousResultStudents > 0 && (
                            <>
                              Students with multiple stored result records:{' '}
                              {record.coverage.ambiguousResultStudents}.{' '}
                            </>
                          )}
                          {record.coverage.invalidResultStudents > 0 && (
                            <>
                              Students with a stored score requiring review:{' '}
                              {record.coverage.invalidResultStudents}.{' '}
                            </>
                          )}
                          {record.coverage.invalidMaximum && 'The stored maximum score requires review.'}
                        </p>
                      </div>
                    )}
                  </>
                )}
                <div className="saha-task-links">
                  <a href={'/assessments/' + encodeURIComponent(record.id)}>Open saved results</a>
                </div>
              </div>
            </article>
          ))}
        </section>
        <RoleGuide role="teacher" />
        <p className="saha-snapshot-label">Snapshot: {new Date(snapshot.asOf).toLocaleString()}</p>
      </div>
    </AppShell>
  );
}
