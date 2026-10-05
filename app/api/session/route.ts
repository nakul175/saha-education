import { getPrincipal, DEMO_USERS } from '@/lib/education/auth';
import type { Principal } from '@/lib/education/types';

export async function POST(request: Request) {
  const body: { role?: string } = await request.json();
  const { role } = body;
  
  // Get the principal (this would normally come from an actual session)
  const principal = getPrincipal(request);
  
  if (!principal) {
    // For demo purposes, we'll look up a demo user based on role
    const demoUser = DEMO_USERS[role || ''];
    
    if (!demoUser) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }
    
    // Set the cookie for demo user
    const cookieValue = `saha_demo_role=${role}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`;
    return Response.json(demoUser, {
      headers: { 'Set-Cookie': cookieValue },
    });
  }
  
  // If we already have a principal, return it
  return Response.json(principal);
}

export async function GET() {
  const principal = getPrincipal();
  
  if (!principal) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  return Response.json(principal);
}

export async function DELETE(request: Request) {
  // Clear the demo role cookie
  const cookieValue = 'saha_demo_role=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0';
  return Response.json({ message: 'Logged out' }, {
    headers: { 'Set-Cookie': cookieValue },
  });
}