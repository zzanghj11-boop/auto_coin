export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashNav from '@/components/DashNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <div className="min-h-screen">
      <DashNav email={user.email ?? ''} />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">{children}</main>
    </div>
  );
}
