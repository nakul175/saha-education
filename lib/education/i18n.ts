// Internationalization utilities for Saha Education
import { type Locale } from '@/lib/locales';

export function getLocale(request: Request): Locale {
  // Get locale from request headers or URL
  const acceptLanguage = request.headers.get('accept-language');
  if (!acceptLanguage) {
    return 'en';
  }
  
  // Parse the locale from Accept-Language header
  const languages = acceptLanguage.split(',').map((lang) => lang.split(';')[0].trim());
  const supportedLocales = ['en', 'fr', 'es'];
  
  for (const language of languages) {
    if (supportedLocales.includes(language)) {
      return language as Locale;
    }
    
    // Handle locale variants like 'en-US' vs 'en'
    const langBase = language.split('-')[0];
    if (supportedLocales.includes(langBase)) {
      return langBase as Locale;
    }
  }
  
  // Default to English
  return 'en';
}

export function t(key: string, locale: Locale = 'en'): string {
  // This is a simplified implementation
  // In a real app, this would load translations from files based on locale
  const translations: Record<string, Record<string, string>> = {
    en: {
      'students': 'Students',
      'guardians': 'Guardians',
      'courses': 'Courses',
      'classes': 'Classes',
      'enrolments': 'Enrolments',
      'assessments': 'Assessments',
      'reportCards': 'Report Cards',
      'attendance': 'Attendance',
      'notifications': 'Notifications',
      'school': 'School',
      'teacher': 'Teacher',
      'guardian': 'Guardian',
      'student': 'Student',
    },
    fr: {
      'students': 'Étudiants',
      'guardians': 'Tuteurs',
      'courses': 'Cours',
      'classes': 'Classes',
      'enrolments': 'Inscriptions',
      'assessments': 'Évaluations',
      'reportCards': 'Bulletins scolaires',
      'attendance': 'Présence',
      'notifications': 'Notifications',
      'school': 'École',
      'teacher': 'Enseignant',
      'guardian': 'Tuteur',
      'student': 'Étudiant',
    },
    es: {
      'students': 'Estudiantes',
      'guardians': 'Tutores',
      'courses': 'Cursos',
      'classes': 'Clases',
      'enrolments': 'Inscripciones',
      'assessments': 'Evaluaciones',
      'reportCards': 'Boletines escolares',
      'attendance': 'Asistencia',
      'notifications': 'Notificaciones',
      'school': 'Escuela',
      'teacher': 'Maestro',
      'guardian': 'Tutor',
      'student': 'Estudiante',
    }
  };
  
  return translations[locale]?.[key] || key;
}