import { NextRequest } from 'next/server';
import { listSchools } from '@/lib/education/schools';
import { createSchool } from '@/lib/education/schools';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { schoolSchema } from '@/lib/education/validation';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import type { SchoolInput } from '@/lib/education/validation';

export async function GET(request: NextRequest) {
  try {
    const schools = await listSchools();
    return Response.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    return Response.json({ error: 'Failed to fetch schools' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = getPrincipal();
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    requireRole(principal, 'admin');
    
    const result = await parseRequestBodyWithErrorHandling(schoolSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    
    const school = await createSchool(result.data);
    return Response.json(school, { status: 201 });
  } catch (error) {
    console.error('Error creating school:', error);
    return Response.json({ error: 'Failed to create school' }, { status: 500 });
  }
}