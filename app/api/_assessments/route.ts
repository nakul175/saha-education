import { listAssessments, createAssessment } from '@/lib/education/assessments';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { assessmentSchema } from '@/lib/education/validation';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get('classId') || undefined;

  try {
    const assessments = await listAssessments(classId ? { classId } : undefined);
    return Response.json(assessments);
  } catch (error) {
    return Response.json({ error: 'Failed to fetch assessments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const principal = getPrincipal();
  
  if (!principal) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Only teachers and admins can create assessments
  try {
    requireRole(principal, 'teacher');
  } catch {
    try {
      requireRole(principal, 'admin');
    } catch {
      return Response.json({ error: 'Forbidden: Teacher or admin role required' }, { status: 403 });
    }
  }

  try {
    const result = await parseRequestBodyWithErrorHandling(assessmentSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    
    const assessment = await createAssessment({
      classId: result.data.classId,
      title: result.data.title,
      kind: result.data.kind,
      maxScore: result.data.maxScore,
      date: result.data.date
    });

    return Response.json(assessment, { status: 201 });
  } catch (error) {
    return Response.json({ error: 'Failed to create assessment' }, { status: 500 });
  }
}