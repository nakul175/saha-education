"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- retain full-page navigation for the verified vinext beta recovery behavior. */
import * as React from 'react';
import { Sun, Users, CircleCheck, BookOpen, AudioLines, ChartNoAxesCombined, School, Bell, Menu, X, ChevronDown, ArrowUpRight, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { workspaceGroups, currentWorkspace, accountDisplayScope } from '@/lib/education/navigation';
import type { Principal } from '@/lib/education/types';

type HeaderAccount = { id: string; role: string; schoolId: string; name: string; schoolName: string };
const roleLabels = { admin: 'Administrator', teacher: 'Teacher', guardian: 'Guardian', student: 'Student' };
const icons = { sun: Sun, users: Users, check: CircleCheck, book: BookOpen, reading: AudioLines, chart: ChartNoAxesCombined, school: School };

export function AppShell({ principal, children }: { principal: Principal | null; children: React.ReactNode }) {
  const [syntheticDemo, setSyntheticDemo] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [signOutStarted, setSignOutStarted] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState('');
  const [pathname, setPathname] = React.useState('/');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState<HeaderAccount | null>(null);
  const signOutInFlight = React.useRef(false);
  React.useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) setPathname(window.location.pathname || '/'); });
    fetch('/api/demo', { cache: 'no-store' }).then(async response => {
      if (!response.ok) { await response.text(); return; }
      const result = await response.json() as { available?: unknown };
      if (active) setSyntheticDemo(result.available === true);
    }).catch(() => { /* The demo label grants no authority. */ });
    return () => { active = false; };
  }, []);
  React.useEffect(() => {
    let active = true;
    // Display metadata is accepted only for the exact parent-authorised identity and school.
    // An unrelated/live session never restores withheld page authority or a null principal.
    if (principal && !signOutStarted) {
      fetch('/api/account', { cache: 'no-store' }).then(async response => {
        if (!response.ok) { await response.text(); return; }
        const value = await response.json() as Pick<HeaderAccount, 'name' | 'schoolName'>;
        const scope = await accountDisplayScope(principal.id, principal.role, principal.schoolId);
        if (active && response.headers.get('x-saha-account-scope') === scope && typeof value.name === 'string' && typeof value.schoolName === 'string') setAccount({ ...value, id: principal.id, role: principal.role, schoolId: principal.schoolId || '' });
      }).catch(() => { /* A readable role label remains available when metadata is unavailable. */ });
    }
    return () => { active = false; };
  }, [principal, signOutStarted]);
  React.useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return;
    const menu = document.getElementById('school-sidebar');
    menu?.querySelector<HTMLElement>('a, button')?.focus();
    const onResize = () => { if (window.innerWidth > 760) setMenuOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menuOpen]);
  function closeMenu() {
    setMenuOpen(false);
    if (typeof document !== 'undefined') document.querySelector<HTMLButtonElement>('.saha-menu-button')?.focus();
  }
  function navigationKeys(event: React.KeyboardEvent<HTMLElement>) {
    if (!menuOpen || typeof document === 'undefined') return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')).filter(node => node.getClientRects().length > 0);
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  }
  const currentAccount = principal && account?.id === principal.id && account.role === principal.role && account.schoolId === (principal.schoolId || '') ? account : null;
  const name = currentAccount?.name || (principal ? roleLabels[principal.role] : 'Your account');
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
  const current = principal ? currentWorkspace(pathname, principal.role) : { groupId: '', href: '', label: 'Workspace' };
  const groups = principal ? workspaceGroups(principal.role) : [];
  const handleSignOut = async () => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSignOutStarted(true); setSigningOut(true); setSignOutError('');
    try {
      const response = await fetch('/api/session', { method: 'DELETE' });
      await response.text();
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please try again.');
      window.location.assign(new URL('/login', window.location.origin).href);
    } catch {
      setSignOutError('Sign out could not be confirmed. Please try again.');
      setSigningOut(false); signOutInFlight.current = false;
    }
  };
  if (signOutStarted) return <div className="saha-session-screen">
    <p className="saha-wordmark"><span aria-hidden="true">s</span>saha.</p>
    <main aria-labelledby="sign-out-title" className="saha-session-panel space-y-4">
      <h1 id="sign-out-title">Confirming sign out</h1><p>This page is hidden while sign-out is being confirmed.</p>
      {signingOut && <p role="status">Signing out…</p>}{signOutError && <p role="alert">{signOutError}</p>}
      {signOutError && <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>Retry sign out</Button>}
      <p><a className="saha-text-link" href="/login">Continue to sign-in</a></p>
    </main>
  </div>;
  return <div className="saha-app" data-ui-design="calm-workspace">
    <a href="#main-content" className="saha-skip-link">Skip to main content</a>
    {principal && <>
      {menuOpen && <button className="saha-nav-backdrop" aria-label="Close navigation" onClick={closeMenu} />}
      <aside id="school-sidebar" className="saha-sidebar" data-open={menuOpen} onKeyDown={navigationKeys} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen ? true : undefined} aria-label={menuOpen ? 'School workspace navigation' : undefined}>
        <button type="button" className="saha-nav-close" aria-label="Close school navigation" onClick={closeMenu}><X size={20} aria-hidden="true" /></button><a href="/" className="saha-wordmark" aria-label="Saha Education home"><span aria-hidden="true">s</span>saha.</a>
        <div className="saha-school-label"><strong>{currentAccount?.schoolName || 'Saha Education'}</strong><span>{roleLabels[principal.role]} workspace</span></div>
        <nav aria-label="School navigation" className="saha-nav">
          {groups.map(group => {
            const Icon = icons[group.icon as keyof typeof icons];
            const isCurrent = current.groupId === group.id;
            const open = expanded === null ? isCurrent : expanded === group.id;
            return <div key={group.id} className="saha-nav-group">
              <div className="saha-nav-line">
                <a href={group.links[0].href} className="saha-nav-primary" data-active={isCurrent} aria-current={isCurrent && (group.links.length === 1 || current.href === group.links[0].href) ? 'page' : undefined}>
                  <Icon size={18} aria-hidden="true" /><span>{group.label}</span>
                </a>
                {group.links.length > 1 && <button type="button" aria-label={group.label + ' pages'} aria-expanded={open} aria-controls={'nav-' + group.id} className="saha-nav-toggle" onClick={() => setExpanded(open ? '' : group.id)}><ChevronDown size={14} aria-hidden="true" /></button>}
              </div>
              {group.links.length > 1 && <div className="saha-nav-children" id={'nav-' + group.id} hidden={!open}>
                {group.links.map((link, index) => index === 0 ? <span key={link.href} className="saha-nav-section-label">{link.label}</span> : <a key={link.href} href={link.href} aria-current={current.href === link.href ? 'page' : undefined}>{link.label}</a>)}
              </div>}
            </div>;
          })}
        </nav>
        <div className="saha-sidebar-footer"><a className="saha-account" href="/account"><span className="saha-person-avatar" aria-hidden="true">{initials}</span><span><strong>{name}</strong><small>Your account</small></span><ArrowUpRight size={15} aria-hidden="true" /></a><Button variant="ghost" className="saha-sign-out" onClick={handleSignOut} disabled={signingOut}><LogOut size={16} aria-hidden="true" />Sign out</Button></div>
      </aside>
    </>}
    <div className="saha-workspace">
      <header className="saha-topbar">
        <div className="saha-header-context">{principal && <button type="button" className="saha-menu-button" aria-label={menuOpen ? 'Close school navigation' : 'Open school navigation'} aria-controls="school-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>}<span className="saha-breadcrumb-school">{currentAccount?.schoolName || 'Saha Education'}</span><span aria-hidden="true" className="saha-breadcrumb-divider">/</span><strong>{current.label}</strong></div>
        <div className="saha-header-actions">{principal ? <a href="/notifications" className="saha-inbox-link" aria-current={pathname === '/notifications' ? 'page' : undefined}><Bell size={17} aria-hidden="true" /><span>Notifications</span></a> : <Button variant="outline" size="sm" asChild><a href="/login">Login</a></Button>}</div>
      </header>
      {syntheticDemo && <aside className="saha-demo-banner" aria-label="Synthetic demo"><p><ShieldCheck size={15} aria-hidden="true" /><strong>Synthetic demo.</strong> Fictional records only; please don’t enter real student details.</p><a href="/login">Switch demo role</a></aside>}
      <main id="main-content" tabIndex={-1} className="saha-main">{children}</main>
    </div>
  </div>;
}
