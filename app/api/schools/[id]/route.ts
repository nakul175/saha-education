import { NextRequest } from 'next/server';
import { getSchool, updateSchool } from '@/lib/education/schools';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { schoolSchema } from '@/lib/education/validation';
import { getPrincipal, requireRole } from '@/lib/education/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const school = await getSchool(id);
    
    if (!school) {
      return Response.json({ error: 'School not found' }, { status: 404 });
    }
    
    return Response.json(school);
  } catch (error) {
    console.error('Error fetching school:', error);
    return Response.json({ error: 'Failed to fetch school' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    requireRole(principal, 'admin');

    const result = await parseRequestBodyWithErrorHandling(schoolSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const updatedSchool = await updateSchool(id, result.data);
    
    if (!updatedSchool) {
      return Response.json({ error: 'School not found' }, { status: 404 });
    }
    
    return Response.json(updatedSchool);
  } catch (error) {
    console.error('Error updating school:', error);
    return Response.json({ error: 'Failed to update school' }, { status: 500 });
  }
}