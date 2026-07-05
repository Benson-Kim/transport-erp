import { redirect } from 'next/navigation';

/**
 * #58: the create-next-app scaffolding that lived here was dead code -
 * next.config.ts permanently redirects / -> /dashboard and src/proxy.ts
 * gates everything behind auth, so this page never rendered (cleanup, not
 * a security fix, per the corrected review). The in-code redirect keeps
 * the behaviour even if the config entry is ever removed.
 */
export default function Home() {
  redirect('/dashboard');
}
