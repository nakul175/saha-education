import type { Principal, Class, Assessment, Student, ReportCard } from './types';

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('Please sign in.');
  }
  if (!response.ok) throw new Error('The request could not be completed.');
  return response.json() as Promise<T>;
}
export const getPrincipal = () => requestJson<Principal>('/api/session');
export const listClasses = () => requestJson<Class[]>('/api/classes');
export const listStudents = () => requestJson<Student[]>('/api/students');
export const listAssessments = () => requestJson<Assessment[]>('/api/assessments');
export const listAttendance = (filter: { classId?: string }) =>
  requestJson<{studentId: string; date: string; status: string}[]>('/api/attendance?' + new URLSearchParams(filter));
export const listReportCards = (studentId: string) =>
  requestJson<ReportCard[]>('/api/report-cards?' + new URLSearchParams({studentId}));
export const createReportCard = (input: {studentId: string; term: string; summary: string; overallGrade: string}) =>
  requestJson<ReportCard>('/api/report-cards', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
export const publishReportCard = (id: string) =>
  requestJson<ReportCard>('/api/report-cards/' + encodeURIComponent(id), {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({publish: true})});
