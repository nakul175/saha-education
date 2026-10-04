'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportCard } from '@/lib/education/types';

export default function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const [reportCard, setReportCard] = useState<ReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReportCard = async () => {
      try {
        const { id } = await params;
        const response = await fetch(`/api/report-cards/${id}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch report card');
        }
        
        const data = (await response.json()) as ReportCard;
        setReportCard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchReportCard();
  }, [params]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="container py-6">Loading...</div>;
  }

  if (error) {
    return (
      <div className="container py-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!reportCard) {
    return (
      <div className="container py-6">
        <Card>
          <CardContent className="pt-6">
            <p>Report card not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Report Card</h1>
        <Button onClick={handlePrint}>Print Report</Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Report Card Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p><span className="font-medium">Student ID:</span> {reportCard.studentId}</p>
            </div>
            <div>
              <p><span className="font-medium">Term:</span> {reportCard.term}</p>
            </div>
            <div>
              <p><span className="font-medium">Overall Grade:</span> {reportCard.overallGrade}</p>
            </div>
            <div>
              <p><span className="font-medium">Published:</span> {reportCard.publishedAt ? new Date(reportCard.publishedAt).toLocaleDateString() : 'Not published'}</p>
            </div>
            <div className="md:col-span-2">
              <p><span className="font-medium">Summary:</span></p>
              <p>{reportCard.summary || 'No summary available'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}