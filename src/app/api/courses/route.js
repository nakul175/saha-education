// API route for course management
import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongodb';
import Course from '@/src/modules/courses/course.model';

export async function GET() {
  try {
    await connectToDB();
    
    const courses = await Course.find()
      .populate('teacherId', 'firstName lastName')
      .populate('schoolId', 'name code');
    
    return NextResponse.json(courses);
  } catch (error) {
    // console.error('Error fetching courses:', error);
    return NextResponse.json(
      { message: 'Failed to fetch courses' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectToDB();
    
    const body = await request.json();
    
    const course = new Course(body);
    
    const savedCourse = await course.save();
    
    return NextResponse.json(savedCourse, { status: 201 });
  } catch (error) {
    // console.error('Error creating course:', error);
    return NextResponse.json(
      { message: 'Failed to create course' },
      { status: 500 }
    );
  }
}