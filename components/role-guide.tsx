import { demoRuntimeAllowed } from '@/lib/education/demo-policy';
import type { Role } from '@/lib/education/types';

type Step = { href: string; label: string; detail: string };
type Guide = { intro: string; can: string[]; steps: Step[] };

// Plain-language orientation for each role. The "try this" path only appears in the synthetic demo, and every
// link goes to a page that already enforces what this role may see.
const GUIDES: Record<Role, Guide> = {
  admin: {
    intro: 'You look after the whole school. You can see totals, share reports with families and decide who is linked to which profile.',
    can: ['See how many students, courses and classes the school has.', 'Share finished report cards with families.', 'Link a sign-in account to the right student or guardian profile.', 'Keep the course list and class lists up to date.'],
    steps: [
      { href: '/report-cards', label: 'Open Report cards', detail: 'Shared reports and private drafts are listed separately. Drafts stay hidden from families.' },
      { href: '/classes', label: 'Open Classes', detail: 'Pick a class to see its students and its attendance.' },
      { href: '/curriculum', label: 'Open the Curriculum library', detail: 'See the approved teaching references that teachers can copy from.' },
      { href: '/admin/profile-links', label: 'Open Profile links', detail: 'See which accounts are linked to student and guardian profiles.' },
    ],
  },
  teacher: {
    intro: 'You teach your own classes. You can take attendance, record results, plan reading practice and share class resources.',
    can: ['Take attendance for each class meeting.', 'Enter results and add short feedback for students.', 'Record reading checks and see how each student is progressing.', 'Share approved lessons and worksheets with a class.'],
    steps: [
      { href: '/classes', label: 'Open your classes', detail: 'Choose a class, then choose Take attendance to see the recent days.' },
      { href: '/assessments', label: 'Open Assessments', detail: 'Open an assessment to see which students have results and which are still blank.' },
      { href: '/reading-review', label: 'Open Reading history', detail: 'See weekly reading checks. Counts only; no recordings are kept.' },
      { href: '/resources', label: 'Open Teaching resources', detail: 'See approved worksheets and a draft that is still waiting for review.' },
    ],
  },
  guardian: {
    intro: 'You can see the children linked to your account. You can read their attendance, their shared reports and notices from the school.',
    can: ['See how often each child was present, late or away.', 'Read report cards once the school has shared them.', 'Read notices from the school.'],
    steps: [
      { href: '/report-cards', label: 'Open Report cards', detail: 'Only reports the school has shared are shown. A draft stays private.' },
      { href: '/attendance', label: 'Open Attendance', detail: 'Choose a class to see which days your child was in school.' },
      { href: '/assessments', label: 'Open Assessments', detail: 'See results the school has chosen to share.' },
      { href: '/notifications', label: 'Open Notices', detail: 'Read messages from the school. Nothing is sent outside this demo.' },
    ],
  },
  student: {
    intro: 'This is your own page. You can open class resources, write your answers and read your teacher\'s feedback.',
    can: ['Open the worksheets and lessons your teacher shared with your class.', 'Write and save your answers.', 'Read feedback from your teacher.', 'See your own attendance and shared reports.'],
    steps: [
      { href: '/learning', label: 'Open Class resources', detail: 'Read "A seed becomes a tree" and see the feedback on your answers.' },
      { href: '/assessments', label: 'Open Assessments', detail: 'See your own results for each quiz and test.' },
      { href: '/attendance', label: 'Open Attendance', detail: 'Choose a class to see the days you were in school.' },
      { href: '/notifications', label: 'Open Notices', detail: 'Read messages from your school.' },
    ],
  },
};

export function RoleGuide({ role }: { role: Role }) {
  const guide = GUIDES[role];
  const demo = demoRuntimeAllowed();
  return <section aria-labelledby="role-guide-title" data-role-guide={role} className="min-w-0 space-y-4 rounded border bg-muted/40 p-4 break-words">
    <div className="space-y-2">
      <h2 id="role-guide-title">What you can do here</h2>
      <p>{guide.intro}</p>
      <ul className="list-disc space-y-1 pl-5">{guide.can.map(item => <li key={item}>{item}</li>)}</ul>
    </div>
    {demo && <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-4 text-amber-950" data-demo-path={role}>
      <h2 id="demo-path-title">Try this: five minutes</h2>
      <p className="text-sm"><strong>Synthetic demo.</strong> Every name and record here is invented. Anything you change stays in this demo.</p>
      <ol className="list-decimal space-y-2 pl-5" aria-labelledby="demo-path-title">{guide.steps.map(step => <li key={step.href}>
        <a href={step.href} className="font-medium underline underline-offset-4">{step.label}</a>. {step.detail}</li>)}</ol>
    </div>}
  </section>;
}
