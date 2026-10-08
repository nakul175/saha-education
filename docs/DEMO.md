# Run the Saha Education demo

This starts the whole application on your own computer with an invented school. No identity provider, paid AI service, reading-app account or real message is used, and nothing leaves the machine. Every name, class and record is fictional.

## Run it

You need Node 22.13 or newer and the repository's dependencies (`pnpm install`).

```
pnpm demo
```

The first run builds the application if there is no build yet, creates a local database from every migration plus the invented school, starts the Worker on port 8787 and prints the address. Open `http://127.0.0.1:8787/login`, tick the box that says the records are fictional, and choose a role.

| Option | What it does |
| --- | --- |
| `pnpm demo -- --port 8810` | Use another port. Use the address with `127.0.0.1`, not `localhost`; the Worker only accepts that origin. |
| `pnpm demo -- --reset` | Throw the local demo database away and create it again. |
| `pnpm demo -- --rebuild` | Build again before starting (use after changing the code). |
| `pnpm demo -- --anchor 2026-10-06` | Pin the term dates. By default the term ends the day before today, so the attendance always looks current. |
| `pnpm demo -- --prepare-only` | Create the database and print the start command without starting the Worker. |

The same thing without pnpm: `node scripts/demo.mjs --port 8810`. The database lives in `.wrangler/demo` (ignored by git). Stop the demo with Ctrl-C. Starting it again reuses the same database, so your changes are still there; `--reset` brings back the original school.

## The invented school

River School has one administrator, four teachers, three courses (English, Mathematics, Science), six classes, 40 students, 37 guardian profiles and 120 enrolments (one of them withdrawn). It also has about seven weeks of attendance (2,596 records, with some students who are often away), 19 assessments with 357 results, 40 report cards (20 shared with families, 20 still private drafts), 256 weekly reading checks in English and Hindi, 5 teaching resources with a worked example of an assignment and feedback, 3 curriculum references and school notices. The exact numbers are asserted by `tests/integration/demo-seed-contract.mjs`.

| Role | Account shown after sign-in | What you see |
| --- | --- | --- |
| Administrator | `saha-demo-admin` | School totals, report sharing, profile links, courses and classes. |
| Teacher | `saha-demo-teacher` | Three classes (English 5A, English 5B, Science 5A), attendance, results, reading history, resources. |
| Guardian | `saha-demo-guardian` | Two linked children, their attendance, shared reports and notices. |
| Student | `saha-demo-student` | Class resources, the student's own results and feedback. |

Three more teachers (`saha-demo-teacher-2` to `-4`) own the other three classes. The sign-in buttons only use the four fixed accounts above.

## Five-minute walkthrough

Each role's home page has a yellow "Try this: five minutes" box with the same steps. The box is only shown in demo mode.

1. **Guardian (about 1 minute).** Sign in as Guardian. Open *Report cards*: one child has a shared report; the other child's report is a draft and is not listed. Open *Notices*: the notice about the report is there. Nothing is sent outside the demo.
2. **Teacher (about 2 minutes).** Sign out, sign in as Teacher. Open *Classes*, choose English 5A, then *Take attendance* to see recent days. Open *Assessments*: one assessment has no marks yet. Open *Reading history* for the weekly checks.
3. **Administrator (about 1 minute).** Sign in as Administrator. Open *Report cards* to see shared and draft reports together. Open *Profile links* to see which accounts belong to which student and guardian.
4. **Student (about 1 minute).** Sign in as Student. Open *Class resources* and read the worksheet with the teacher's feedback.

Try the privacy boundary on purpose: as Guardian, the home page lists exactly two students (Maya and Arun Iyer) and the draft report for the second child shows as "No published report cards available". No other family's children appear.

## What this does not show (known limits)

- Hosting: since 7 October 2026 a private copy runs on the shared DigitalOcean droplet at `https://education.aplyd.org` (behind a Caddy password wall, synthetic data; the demo sign-in was switched on there on 8 October 2026; see [deploy/README.md](../deploy/README.md)). The reviewed hosted journey (case TC-284) has not been run. A Cloudflare deployment script exists ([guide](DEPLOY-CLOUDFLARE.md)) but has never run against a real account. The earlier private Sites deployment is still blocked; see [the hosting record](current/HOSTED-DEPLOYMENT-FAILURE.md).
- The screens are in English only. The Hindi content (a worksheet and reading checks) is stored and shown in its own script, but labels and messages are not translated. A language and locale review is a human decision that has not been made.
- Real sign-in, reading-app (ORF) data, AI planning and delivery to real families are all switched off. The launcher drops any `SAHA_OIDC_*` setting from its environment, because a real school sign-in setting would switch demo mode off.
- The data is synthetic and the term dates move with the date you start. Do not enter real student details.
- Automated checks of layout and accessibility are recorded in [the demo experience record](current/DEMO-experience.md). They are not accessibility acceptance and do not replace review by named people with assistive technology.
- The school's other workstreams (courses, attendance, assessments and so on) change what the demo can do. If a step in this guide no longer matches a screen, the screen is right and this guide needs updating.
