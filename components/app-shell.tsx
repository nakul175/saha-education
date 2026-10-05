"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import type { Principal } from "@/lib/education/types";
import { canRead, canWrite, canDelete } from "@/lib/education/roles";

export function AppShell({
  principal: initialPrincipal,
  children,
}: {
  principal: Principal | null;
  children: React.ReactNode;
}) {
  const [principal, setPrincipal] = React.useState<Principal | null>(initialPrincipal);
  React.useEffect(() => {
    if (initialPrincipal) { setPrincipal(initialPrincipal); return; }
    let active = true;
    fetch('/api/session', {cache: 'no-store'}).then(async response => {
      if (response.ok && active) setPrincipal(await response.json() as Principal);
    }).catch(() => { /* The protected layout and APIs enforce authentication. */ });
    return () => { active = false; };
  }, [initialPrincipal]);
  const handleSignOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    window.location.href = "/login";
  };

  // Navigation items for different roles
  const navigationItems = [
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
      return ['students', 'classes', 'courses', 'enrolments', 'attendance', 'assessments', 'report-cards'].includes(item.id);
    }
    
    // Guardian can access guardians and notifications
    if (principal.role === 'guardian') {
      return ['students', 'classes', 'attendance', 'assessments', 'report-cards', 'notifications'].includes(item.id);
    }
    
    // Student can only access dashboard and notifications
    if (principal.role === 'student') {
      return ['students', 'classes', 'attendance', 'assessments', 'report-cards', 'notifications'].includes(item.id);
    }
    
    return false;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold">Saha Education</h1>
          </div>
          
          {principal ? (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Avatar className="size-8">
                  <AvatarFallback>
                    {principal.id.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-sm">
                  <p className="font-medium">{principal.id}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {principal.role}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm">
              <a href="/login">Login</a>
            </Button>
          )}
        </div>
      </header>

      {/* Navigation */}
      {principal && (
        <div className="border-b bg-muted/50">
          <div className="container px-4 py-2">
            <NavigationMenu>
              <NavigationMenuList className="flex flex-wrap gap-x-1">
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
      <main className="container py-6">
        {children}
      </main>
    </div>
  );
}