import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saha Education',
  description: 'School management system for education institutions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
