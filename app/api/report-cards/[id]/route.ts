import { NextRequest } from 'next/server';
import { getReportCard, publishReportCard } from '@/lib/education/report-cards';
import { getStudent } from '@/lib/education/students';
import { listGuardiansForStudent } from '@/lib/education/students';
import { createNotification } from '@/lib/education/notifications';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { canWrite } from '@/lib/education/roles';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { z } from 'zod';

// Schema for the expected patch request body
const publishRequestSchema = z.object({
  publish: z.boolean().optional()
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const reportCard = await getReportCard(id);
    
    if (!reportCard) {
      return Response.json({ error: 'Report card not found' }, { status: 404 });
    }
    
    return Response.json(reportCard, { status: 200 });
  } catch (error) {
    console.error('Error fetching report card:', error);
    return Response.json({ error: 'Failed to fetch report card' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Check if user has write permissions
    if (!canWrite(principal.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    const { id } = await params;
    
    const reportCard = await getReportCard(id);
    
    if (!reportCard) {
      return Response.json({ error: 'Report card not found' }, { status: 404 });
    }
    
    // Parse request body to check if it's a publish request
    const result = await parseRequestBodyWithErrorHandling(publishRequestSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    
    const body = result.data;
    
    // Check if this is a publish request
    if (body.publish === true) {
      // Publish the report card
      const publishedReportCard = await publishReportCard(id);
      
      if (!publishedReportCard) {
        return Response.json({ error: 'Failed to publish report card' }, { status: 500 });
      }
      
      // Get student information for notification
      const student = await getStudent(reportCard.studentId);
      
      if (student) {
        // Get guardians for the student
        const guardians = await listGuardiansForStudent(reportCard.studentId);
        
        // Send notifications to all guardians
        for (const guardian of guardians) {
          await createNotification({
            userId: guardian.id, // Guardian ID is stored in the guardian's id field  
            channel: 'in_app', // Defaulting to in-app notification
            title: 'Report Card Published',
            body: `Your child ${student.firstName} ${student.lastName}'s report card has been published.`,
          });
        }
      }
      
      return Response.json(publishedReportCard, { status: 200 });
    }
    
    // If not a publish request, return bad request
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Error updating report card:', error);
    return Response.json({ error: 'Failed to update report card' }, { status: 500 });
  }
}