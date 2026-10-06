"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation avoids the observed vinext beta client transition failure. */
import * as React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import type { Principal } from "@/lib/education/types";

export function AppShell({
  principal,
  children,
}: {
  principal: Principal | null;
  children: React.ReactNode;
}) {
  // Every caller supplies its verified current principal. Null hides identity
  // immediately while the page reloads or loses access; the shell never restores it.
  const [syntheticDemo, setSyntheticDemo] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [signOutStarted, setSignOutStarted] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState('');
  const signOutInFlight = React.useRef(false);
  React.useEffect(() => {
    let active = true;
    fetch('/api/demo', {cache: 'no-store'}).then(async response => {
      if (!response.ok) { await response.text(); return; }
      const result = await response.json() as { available?: unknown };
      if (active) setSyntheticDemo(result.available === true);
    }).catch(() => { /* This label grants no authority; server sessions scope all records. */ });
    return () => { active = false; };
  }, []);
  const handleSignOut = async () => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSignOutStarted(true);
    setSigningOut(true); setSignOutError('');
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      await response.text();
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please try again.');
      window.location.assign(new URL('/login', window.location.origin).href);
    } catch {
      setSignOutError('Sign out could not be confirmed. Please try again.');
      setSigningOut(false); signOutInFlight.current = false;
    }
  };

  if (signOutStarted) return (
    <div className="min-h-screen bg-background">
      <header className="border-b"><div className="container px-4 py-4"><h1 className="text-xl font-bold">Saha Education</h1></div></header>
      <main aria-labelledby="sign-out-title" className="container max-w-xl space-y-4 px-4 py-8">
        <h2 id="sign-out-title">Confirming sign out</h2>
        <p>This page is hidden while sign-out is being confirmed.</p>
        {signingOut && <p role="status">Signing out…</p>}
        {signOutError && <p role="alert">{signOutError}</p>}
        {signOutError && <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>Retry sign out</Button>}
        <p><a className="font-medium underline underline-offset-4" href="/login">Continue to sign-in</a></p>
      </main>
    </div>
  );

  // Navigation items for different roles
  const navigationItems = [
    { id: 'accounts', label: 'Accounts', path: '/admin/users' },
    { id: 'profile-links', label: 'Profile links', path: '/admin/profile-links' },
    { id: 'curriculum', label: 'Curriculum library', path: '/curriculum' },
    { id: 'reading-review', label: 'Reading review', path: '/reading-review' },
    { id: 'reading-practice', label: 'Reading practice planner', path: '/reading-practice' },
    { id: 'reading-imports', label: 'Reading imports', path: '/reading-imports' },
    { id: 'resources', label: 'Teaching resources', path: '/resources' },
    { id: 'learning', label: 'Class resources', path: '/learning' },
    { id: 'external-apps', label: 'Reading apps', path: '/external-apps' },
    { 
      id: 'dashboard', 
      label: 'Dashboard',
      path: '/'
    },
    { 
      id: 'students', 
      label: 'Students',
      path: '/students'
    },
    { 
      id: 'guardians', 
      label: 'Guardians',
      path: '/guardians'
    },
    { 
      id: 'schools', 
      label: 'Schools',
      path: '/schools'
    },
    { 
      id: 'classes', 
      label: 'Classes',
      path: '/classes'
    },
    { 
      id: 'courses', 
      label: 'Courses',
      path: '/courses'
    },
    { 
      id: 'enrolments', 
      label: 'Enrolments',
      path: '/enrolments'
    },
    { 
      id: 'attendance', 
      label: 'Attendance',
      path: '/attendance'
    },
    { 
      id: 'assessments', 
      label: 'Assessments',
      path: '/assessments'
    },
    { 
      id: 'report-cards', 
      label: 'Report cards',
      path: '/report-cards'
    },
    { 
      id: 'notifications', 
      label: 'Notifications',
      path: '/notifications'
    },
  ];

  // Filter navigation items based on role
  const filteredNavigationItems = navigationItems.filter(item => {
    if (!principal) return false;
    
    // All roles can access dashboard and notifications
    if (item.id === 'dashboard' || item.id === 'notifications') return true;
    
    // Admin can access everything
    if (principal.role === 'admin') return true;
    
    // Teacher can access students, classes, courses, enrolments, attendance, assessments, report-cards
    if (principal.role === 'teacher') {
      return ['students', 'classes', 'courses', 'enrolments', 'attendance', 'assessments', 'report-cards', 'external-apps', 'resources', 'learning', 'curriculum', 'reading-review', 'reading-practice', 'reading-imports'].includes(item.id);
    }
    
    // Guardian can access guardians and notifications
    if (principal.role === 'guardian') {
      return ['students', 'classes', 'attendance', 'assessments', 'report-cards', 'notifications'].includes(item.id);
    }
    
    // Student can only access dashboard and notifications
    if (principal.role === 'student') {
      return ['students', 'classes', 'attendance', 'assessments', 'report-cards', 'notifications', 'learning'].includes(item.id);
    }
    
    return false;
  });

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="absolute left-4 top-4 z-50 -translate-y-24 rounded-md bg-background px-4 py-2 font-medium text-foreground shadow focus:translate-y-0">Skip to main content</a>
      {syntheticDemo && <aside className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-950" aria-label="Synthetic demo">
        <p><strong>Synthetic demo.</strong> Fictional records only; please don’t enter real learner details.</p>
        <a className="font-medium underline underline-offset-4" href="/login">Switch demo role</a>
      </aside>}
      {/* Header */}
      <header className="border-b">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Saha Education</h1>
          </div>
          
          {principal ? (
            <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:w-auto">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="size-8 shrink-0" aria-hidden="true">
                  <AvatarFallback>
                    {principal.id.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-sm">
                  <p className="break-all font-medium">{principal.id}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {principal.role}
                  </p>
                  <a className="text-xs underline underline-offset-4" href="/account">Your account</a>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <a href="/login">Login</a>
            </Button>
          )}
        </div>
        {signOutError && <p className="container px-4 pb-3 text-sm text-destructive" role="alert">{signOutError}</p>}
      </header>

      {/* Navigation */}
      {principal && (
        <div className="border-b bg-muted/50">
          <div className="container px-4 py-2">
            <NavigationMenu aria-label="School navigation" className="max-w-full">
              <NavigationMenuList className="flex flex-wrap justify-start gap-x-1">
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <a
                      href="/"
                      className={cn(
                        "block select-none space-y-1 rounded-md p-2 text-sm font-medium no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none",
                        "text-primary dark:bg-muted dark:focus:bg-muted dark:text-muted-foreground",
                      )}
                    >
                      Dashboard
                    </a>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                
                {filteredNavigationItems.filter(item => item.id !== 'dashboard').map((item) => (
                  <NavigationMenuItem key={item.id}>
                    <NavigationMenuLink asChild>
                      <a
                        href={item.path}
                        className={cn(
                          "block select-none space-y-1 rounded-md p-2 text-sm font-medium no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none",
                          "text-primary dark:bg-muted dark:focus:bg-muted dark:text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </a>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="container py-6">
        {children}
      </main>
    </div>
  );
}
