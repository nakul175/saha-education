import { getDb } from '@/db/index';
import { listResults, recordResults } from '@/lib/education/assessments';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { canWrite } from '@/lib/education/roles';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { assessmentResultSchema } from '@/lib/education/validation';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { z } from 'zod';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    const results = await listResults(id);
    return Response.json(results);
  } catch (error) {
    console.error('Error fetching assessment results:', error);
    return Response.json({ error: 'Failed to fetch assessment results' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Authenticate and check permissions
  const principal = getPrincipal();
  if (!principal) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  
  if (!canWrite(principal.role)) {
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }
  
  // Validate request body
  const result = await parseRequestBodyWithErrorHandling(
    z.object({
      results: z.array(assessmentResultSchema.pick({
        studentId: true,
        score: true,
        grade: true,
        feedback: true
      }).required())
    }),
    request
  );
  
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  
  try {
    await recordResults(id, result.data.results);
    return Response.json({ message: 'Results recorded successfully' });
  } catch (error) {
    console.error('Error recording assessment results:', error);
    return Response.json({ error: 'Failed to record assessment results' }, { status: 500 });
  }
}