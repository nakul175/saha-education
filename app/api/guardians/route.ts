import { listGuardians, createGuardian } from '@/lib/education/guardians';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { guardianSchema } from '@/lib/education/validation';
import type { Principal } from '@/lib/education/types';

export async function GET(request: Request) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const guardians = await listGuardians();
    
    return Response.json(guardians);
  } catch (error) {
    console.error('Error fetching guardians:', error);
    return Response.json({ error: 'Failed to fetch guardians' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin or teacher can create guardians
    try {
      requireRole(principal, 'admin');
    } catch (error) {
      try {
        requireRole(principal, 'teacher');
      } catch (error2) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const result = await parseRequestBodyWithErrorHandling(guardianSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const guardian = await createGuardian(result.data);
    
    return Response.json(guardian, { status: 201 });
  } catch (error) {
    console.error('Error creating guardian:', error);
    return Response.json({ error: 'Failed to create guardian' }, { status: 500 });
  }
}