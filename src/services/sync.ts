import { ensureBaseData, exportBundle, getLocalDataStats, importBundle } from '../db';
import { supabase } from '../lib/supabase';

interface UserDataRow {
  user_id: string;
  payload: unknown;
  updated_at: string;
}

export async function pullCloudData(userId: string) {
  const { data, error } = await supabase
    .from('gearvault_user_data')
    .select('user_id,payload,updated_at')
    .eq('user_id', userId)
    .maybeSingle<UserDataRow>();

  if (error) throw error;
  return data;
}

export async function pushCloudData(userId: string) {
  const payload = await exportBundle();
  const { error } = await supabase.from('gearvault_user_data').upsert(
    {
      user_id: userId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) throw error;
}

export async function initializeUserData(userId: string) {
  await ensureBaseData();
  const remote = await pullCloudData(userId);

  if (!remote) {
    await pushCloudData(userId);
    return { mode: 'pushed-local-to-new-cloud' as const };
  }

  await importBundle(remote.payload as Awaited<ReturnType<typeof exportBundle>>);
  return { mode: 'pulled-cloud-to-local' as const, updatedAt: remote.updated_at };
}

export async function syncNow(userId: string) {
  await ensureBaseData();
  const stats = await getLocalDataStats();
  if (!stats.hasUserData) {
    const remote = await pullCloudData(userId);
    if (remote) {
      await importBundle(remote.payload as Awaited<ReturnType<typeof exportBundle>>);
      return { direction: 'pull' as const };
    }
  }

  await pushCloudData(userId);
  return { direction: 'push' as const };
}
