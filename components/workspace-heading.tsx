import type { ReactNode } from 'react';
export function WorkspaceHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="saha-page-header"><div><p className="saha-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="saha-page-intro">{description}</p></div>{action}</header>;
}
