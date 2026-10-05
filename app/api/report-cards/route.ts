import { NextRequest } from 'next/server';
import { listReportCards, createReportCard } from '@/lib/education/report-cards';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { canWrite } from '@/lib/education/roles';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { reportCardSchema } from '@/lib/education/validation';
import type { ReportCardInput } from '@/lib/education/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || undefined;
    
    const reportCards = await listReportCards(studentId);
    
    return Response.json(reportCards, { status: 200 });
  } catch (error) {
    console.error('Error fetching report cards:', error);
    return Response.json({ error: 'Failed to fetch report cards' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Check if user has write permissions
    if (!canWrite(principal.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    const result = await parseRequestBodyWithErrorHandling(reportCardSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    
    const newReportCard = await createReportCard(result.data);
    
    return Response.json(newReportCard, { status: 201 });
  } catch (error) {
    console.error('Error creating report card:', error);
    return Response.json({ error: 'Failed to create report card' }, { status: 500 });
  }
}