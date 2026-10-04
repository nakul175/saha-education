import { NextRequest } from 'next/server';
import { getAssessment } from '@/lib/education/assessments';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { canRead } from '@/lib/education/roles';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!canRead(principal.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assessment = await getAssessment(id);
    
    if (!assessment) {
      return Response.json({ error: 'Assessment not found' }, { status: 404 });
    }
    
    return Response.json(assessment);
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return Response.json({ error: 'Failed to fetch assessment' }, { status: 500 });
  }
}