// API route for guardian management
import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongodb';
import Guardian from '@/src/modules/users/guardian.model';

export async function GET() {
  try {
    await connectToDB();
    
    const guardians = await Guardian.find()
      .populate('userId', 'firstName lastName email')
      .populate('students', 'firstName lastName');
    
    return NextResponse.json(guardians);
  } catch (error) {
    // console.error('Error fetching guardians:', error);
    return NextResponse.json(
      { message: 'Failed to fetch guardians' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDB();
    
    const body = await request.json();
    
    const guardian = new Guardian(body);
    
    const savedGuardian = await guardian.save();
    
    return NextResponse.json(savedGuardian, { status: 201 });
  } catch (error) {
    // console.error('Error creating guardian:', error);
    return NextResponse.json(
      { message: 'Failed to create guardian' },
      { status: 500 }
    );
  }
}