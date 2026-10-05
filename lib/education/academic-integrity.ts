import { sql, type SQL } from 'drizzle-orm';
import { AccessError, assertPrincipal } from './access';
import type { Principal } from './types';

export class AcademicConflict extends AccessError {
  constructor(message = 'Academic records changed; reload before saving again') { super(message, 409); }
}

export function assertAcademicStaff(principal: Principal): void {
  assertPrincipal(principal);
  if (principal.role !== 'admin' && principal.role !== 'teacher') throw new AccessError('Academic write access required');
}

// All predicates are evaluated by the actual SELECT/INSERT/UPDATE, rather than
// treating an earlier session or validation lookup as continuing authority.
export function liveAcademicPrincipal(principal: Principal): SQL {
  assertPrincipal(principal);
  return sql`exists (select 1 from users actor where actor.id = ${principal.id}
    and actor.school_id = ${principal.schoolId} and actor.role = ${principal.role}
    and actor.disabled_at is null and actor.identity_issuer is not null and actor.identity_issuer <> ''
    and actor.identity_subject is not null and actor.identity_subject <> '')`;
}

export function academicClassWrite(principal: Principal, classId: string | SQL): SQL {
  assertAcademicStaff(principal);
  return sql`${liveAcademicPrincipal(principal)} and exists (select 1 from classes academic_class
    where academic_class.id = ${classId} and academic_class.school_id = ${principal.schoolId}
    and (${principal.role} = 'admin' or academic_class.teacher_id = ${principal.id}))`;
}

export function academicStudentInClass(principal: Principal, studentId: string | SQL, classId: string | SQL): SQL {
  return sql`${academicClassWrite(principal, classId)} and exists (select 1 from students academic_student
    join enrolments academic_enrolment on academic_enrolment.student_id = academic_student.id
    where academic_student.id = ${studentId} and academic_student.school_id = ${principal.schoolId}
      and academic_enrolment.class_id = ${classId} and academic_enrolment.status = 'active')`;
}

export function academicSchoolPair(principal: Principal, studentId: string | SQL, classId: string | SQL): SQL {
  return sql`${liveAcademicPrincipal(principal)} and exists (select 1 from students academic_student
    join classes academic_class on academic_class.id = ${classId}
    where academic_student.id = ${studentId} and academic_student.school_id = ${principal.schoolId}
      and academic_class.school_id = ${principal.schoolId})`;
}

export function rethrowAcademicConflict(error: unknown): never {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (/saha_(?:enrolment|result)_pair_conflict|UNIQUE constraint failed: attendance\.(?:class_id|student_id|date)/.test(current.message)) {
      throw new AcademicConflict();
    }
    current = current.cause;
  }
  throw error;
}
