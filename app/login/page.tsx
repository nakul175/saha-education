"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = async (role: string) => {
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      });

      if (response.ok) {
        router.push("/");
      } else {
        // Handle error
        console.error("Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Saha Education</CardTitle>
          <CardDescription>
            Select your role to access the system
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Welcome to Saha Education. Please select your role to continue.
          </p>
          
          <div className="grid gap-2">
            <Button 
              onClick={() => handleLogin("admin")}
              variant="outline"
            >
              Login as Admin
            </Button>
            
            <Button 
              onClick={() => handleLogin("teacher")}
              variant="outline"
            >
              Login as Teacher
            </Button>
            
            <Button 
              onClick={() => handleLogin("guardian")}
              variant="outline"
            >
              Login as Guardian
            </Button>
            
            <Button 
              onClick={() => handleLogin("student")}
              variant="outline"
            >
              Login as Student
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}