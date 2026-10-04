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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Principal } from "@/lib/education/types";
import { canRead, canWrite, canDelete } from "@/lib/education/roles";

export function AppShell({
  principal,
  children,
}: {
  principal: Principal | null;
  children: React.ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const handleSignOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    window.location.href = "/login";
  };

  // Navigation items for different roles
  const navigationItems = [
    { 
      id: 'dashboard', 
      label: 'Dashboard',
      path: '/dashboard', 
      requiredRole: 'student' 
    },
    { 
      id: 'students', 
      label: 'Students',
      path: '/students', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'guardians', 
      label: 'Guardians',
      path: '/guardians', 
      requiredRole: 'guardian' 
    },
    { 
      id: 'schools', 
      label: 'Schools',
      path: '/schools', 
      requiredRole: 'admin' 
    },
    { 
      id: 'classes', 
      label: 'Classes',
      path: '/classes', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'courses', 
      label: 'Courses',
      path: '/courses', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'enrolments', 
      label: 'Enrolments',
      path: '/enrolments', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'attendance', 
      label: 'Attendance',
      path: '/attendance', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'assessments', 
      label: 'Assessments',
      path: '/assessments', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'report-cards', 
      label: 'Report cards',
      path: '/report-cards', 
      requiredRole: 'teacher' 
    },
    { 
      id: 'notifications', 
      label: 'Notifications',
      path: '/notifications', 
      requiredRole: 'student' 
    },
  ];

  // Filter navigation items based on role
  const filteredNavigationItems = navigationItems.filter(item =>
    principal ? (item.requiredRole === 'admin' ? principal.role === 'admin' : canRead(principal.role)) : false
  );

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
                      href="/dashboard"
                      className={cn(
                        "block select-none space-y-1 rounded-md p-2 text-sm font-medium no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none",
                        "text-primary dark:bg-muted dark:focus:bg-muted dark:text-muted-foreground",
                      )}
                    >
                      Dashboard
                    </a>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                
                {filteredNavigationItems.map((item) => (
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