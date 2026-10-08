import type { SelectStudent } from '@/db/schema';

export type SavedAssessmentResult = {
  studentId: string;
  score: number;
  grade: string | null;
  feedback: string | null;
};
export type AssessmentEditorStudent = SelectStudent & {
  result: { score: number | null; grade: string | null; feedback: string | null };
  dirty: boolean;
};

export function buildAssessmentEditor(
  roster: SelectStudent[],
  saved: SavedAssessmentResult[],
): AssessmentEditorStudent[] {
  const byStudent = new Map<string, SavedAssessmentResult>();
  for (const result of saved) {
    if (byStudent.has(result.studentId))
      throw new Error(
        'Multiple saved results exist for a student. Ask an administrator to review the records before saving.',
      );
    byStudent.set(result.studentId, result);
  }
  const seen = new Set<string>();
  return roster.map((student) => {
    if (seen.has(student.id))
      throw new Error(
        'Multiple enrolment records exist for a student. Ask an administrator to review the records before saving.',
      );
    seen.add(student.id);
    const existing = byStudent.get(student.id);
    return {
      ...student,
      result: existing
        ? { score: existing.score, grade: existing.grade, feedback: existing.feedback }
        : { score: null, grade: null, feedback: null },
      dirty: false,
    };
  });
}

export function assessmentEditorChanges(rows: AssessmentEditorStudent[], maxScore: number) {
  return rows
    .filter((row) => row.dirty)
    .map((row) => {
      const score = row.result.score;
      if (score === null || !Number.isInteger(score) || score < 0 || score > maxScore) {
        throw new Error(`Enter a whole-number score from 0 to ${maxScore} for each edited student.`);
      }
      return {
        studentId: row.id,
        score,
        ...(row.result.grade !== null ? { grade: row.result.grade } : {}),
        ...(row.result.feedback !== null ? { feedback: row.result.feedback } : {}),
      };
    });
}
