import { NextRequest } from 'next/server';
import { getStudent, updateStudent } from '@/lib/education/students';
import { parseRequestBodyWithErrorHandling } from '@/lib/education/request-body';
import { studentSchema } from '@/lib/education/validation';
import { getPrincipal, requireRole } from '@/lib/education/auth';
import type { Principal } from '@/lib/education/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const student = await getStudent(id);
    
    if (!student) {
      return Response.json({ error: 'Student not found' }, { status: 404 });
    }
    
    return Response.json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    return Response.json({ error: 'Failed to fetch student' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const principal = getPrincipal();
    
    if (!principal) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin or teacher can update students
    try {
      requireRole(principal, 'admin');
    } catch (error) {
      try {
        requireRole(principal, 'teacher');
      } catch (error2) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const result = await parseRequestBodyWithErrorHandling(studentSchema, request);
    
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    const updatedStudent = await updateStudent(id, result.data);
    
    if (!updatedStudent) {
      return Response.json({ error: 'Student not found' }, { status: 404 });
    }
    
    return Response.json(updatedStudent);
  } catch (error) {
    console.error('Error updating student:', error);
    return Response.json({ error: 'Failed to update student' }, { status: 500 });
  }
}