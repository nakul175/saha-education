import { NextResponse } from 'next/server';
import { getAssessment } from '@/lib/education/assessments';
import { getPrincipal } from '@/lib/education/auth';
import { canRead } from '@/lib/education/roles';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = getPrincipal();
  
  if (!principal) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  if (!canRead(principal.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const assessment = await getAssessment(id);
    
    if (!assessment) {
      return new Response('Assessment not found', { status: 404 });
    }
    
    return NextResponse.json(assessment);
  } catch (error) {
    return new Response('Internal server error', { status: 500 });
  }
}