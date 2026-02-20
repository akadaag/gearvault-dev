import { clearLocalChangeMarker, ensureBaseData, exportBundle, getLastLocalChange, importBundle } from '../db';
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

  // Local state is now mirrored in the cloud — clear the pending-change marker.
  clearLocalChangeMarker();
}

export async function initializeUserData(userId: string) {
  await ensureBaseData();
  const remote = await pullCloudData(userId);

  if (!remote) {
    // No cloud record yet — push local data to create it.
    await pushCloudData(userId);
    return { mode: 'pushed-local-to-new-cloud' as const };
  }

  // Cloud record exists. Decide direction by comparing timestamps:
  //   - If we have a recorded local change that is newer than the last cloud
  //     update, our local state is authoritative → push.
  //   - Otherwise (first login, new device, or no local changes since last
  //     sync) → pull cloud data to local.
  const lastLocalChange = getLastLocalChange();
  if (lastLocalChange && lastLocalChange > remote.updated_at) {
    await pushCloudData(userId);
    return { mode: 'pushed-local-to-cloud' as const };
  }

  await importBundle(remote.payload as Awaited<ReturnType<typeof exportBundle>>);
  return { mode: 'pulled-cloud-to-local' as const, updatedAt: remote.updated_at };
}

export async function syncNow(userId: string) {
  await ensureBaseData();

  // If there are unsynced local changes, push them to cloud.
  // This covers: item edits, deletions, demo-data removal, and any other
  // mutation that called markLocalDataChanged() (or triggered a Dexie hook).
  const lastLocalChange = getLastLocalChange();
  if (lastLocalChange) {
    await pushCloudData(userId);
    return { direction: 'push' as const };
  }

  // No local changes — check whether the cloud has newer data (e.g. from
  // another device) and pull if so.
  const remote = await pullCloudData(userId);
  if (remote) {
    await importBundle(remote.payload as Awaited<ReturnType<typeof exportBundle>>);
    return { direction: 'pull' as const };
  }

  // Nothing to do.
  return { direction: 'push' as const };
}
