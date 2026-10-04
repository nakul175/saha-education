// API route for school management
import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongodb';
import School from '@/src/modules/schools/school.model';

export async function GET() {
  try {
    await connectToDB();
    
    const schools = await School.find();
    
    return NextResponse.json(schools);
  } catch (error) {
    // console.error('Error fetching schools:', error);
    return NextResponse.json(
      { message: 'Failed to fetch schools' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDB();
    
    const body = await request.json();
    
    const school = new School(body);
    
    const savedSchool = await school.save();
    
    return NextResponse.json(savedSchool, { status: 201 });
  } catch (error) {
    // console.error('Error creating school:', error);
    return NextResponse.json(
      { message: 'Failed to create school' },
      { status: 500 }
    );
  }
}