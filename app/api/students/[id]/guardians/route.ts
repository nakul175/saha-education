import { NextRequest } from 'next/server';
import { listGuardiansForStudent, linkGuardian } from '@/lib/education/students';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { canWrite } from '@/lib/education/roles';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { z } from 'zod';

const linkGuardianSchema = z.object({
  guardianId: z.string(),
  isPrimary: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Anyone can read guardians for a student
    const guardians = await listGuardiansForStudent(id);
    
    return Response.json(guardians);
  } catch (error) {
    console.error('Error fetching student guardians:', error);
    return Response.json({ error: 'Failed to fetch student guardians' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin or teacher can link guardians
    try {
      requireRole(principal, 'admin');
    } catch (error) {
      try {
        requireRole(principal, 'teacher');
      } catch (error2) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const result = await parseRequestBodyWithErrorHandling(linkGuardianSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const { guardianId, isPrimary } = result.data;
    
    // Link the guardian to the student
    await linkGuardian(id, guardianId);
    
    return Response.json({ message: 'Guardian linked successfully' });
  } catch (error) {
    console.error('Error linking guardian:', error);
    return Response.json({ error: 'Failed to link guardian' }, { status: 500 });
  }
}