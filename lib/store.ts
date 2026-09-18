import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from './supabase';
import { memStore, type StoredReport, type PreviewData, type AnalysisReport } from './types';

const CACHE_TTL_HOURS = Number(process.env.CACHE_TTL_HOURS || 24);

export async function findCachedReport(placeKey: string, locale: string): Promise<StoredReport | null> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const hit = memStore.memByPlace.get(`${placeKey}::${locale}`) || null;
    if (!hit) return null;
    const ageH = (Date.now() - new Date(hit.created_at).getTime()) / 3600_000;
    return ageH <= CACHE_TTL_HOURS ? hit : null;
  }
  const since = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();
  const { data } = await sb
    .from('reports')
    .select('*')
    .eq('place_key', placeKey)
    .eq('locale', locale)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as StoredReport) || null;
}

export async function saveReport(input: {
  place_url: string;
  place_key: string;
  business_name: string;
  reviews: StoredReport['reviews'];
  full_report: AnalysisReport;
  preview: PreviewData;
  locale: string;
  mocked: boolean;
}): Promise<StoredReport> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const row: StoredReport = {
      id: randomUUID(),
      ...input,
      email_unlocked: null,
      created_at: new Date().toISOString()
    };
    memStore.memReports.set(row.id, row);
    memStore.memByPlace.set(`${input.place_key}::${input.locale}`, row);
    return row;
  }
  const { data, error } = await sb.from('reports').insert(input).select('*').single();
  if (error) throw new Error(`Supabase kayıt hatası: ${error.message}`);
  return data as unknown as StoredReport;
}

export async function getReportById(id: string): Promise<StoredReport | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return memStore.memReports.get(id) || null;
  const { data } = await sb.from('reports').select('*').eq('id', id).maybeSingle();
  return (data as unknown as StoredReport) || null;
}

export async function markReportUnlocked(id: string, email: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const r = memStore.memReports.get(id);
    if (r) r.email_unlocked = email;
    return;
  }
  await sb.from('reports').update({ email_unlocked: email }).eq('id', id);
}

export async function upsertLead(email: string, reportId: string, locale: string, verified: boolean) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    memStore.memLeads.push({ email, report_id: reportId, locale, verified });
    return;
  }
  await sb.from('leads').upsert(
    { email, report_id: reportId, locale, verified },
    { onConflict: 'email' }
  );
}

export async function createVerificationToken(reportId: string, email: string): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const expires_at = new Date(Date.now() + 48 * 3600_000).toISOString();
  const sb = getSupabaseAdmin();
  if (!sb) {
    (memStore as unknown as { tokens: Map<string, unknown> }).tokens ??= new Map();
    ((memStore as unknown as { tokens: Map<string, unknown> }).tokens).set(token, {
      report_id: reportId,
      email,
      expires_at,
      used: false
    });
    return token;
  }
  const { error } = await sb.from('verification_tokens').insert({
    token,
    report_id: reportId,
    email,
    expires_at
  });
  if (error) throw new Error(`Token kayıt hatası: ${error.message}`);
  return token;
}

export async function consumeVerificationToken(
  token: string
): Promise<{ report_id: string; email: string } | null> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    const map = (memStore as unknown as { tokens?: Map<string, { report_id: string; email: string; expires_at: string; used: boolean }> }).tokens;
    const row = map?.get(token);
    if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) return null;
    row.used = true;
    return { report_id: row.report_id, email: row.email };
  }
  const { data } = await sb.from('verification_tokens').select('*').eq('token', token).maybeSingle();
  const row = data as unknown as { report_id: string; email: string; expires_at: string; used: boolean } | null;
  if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) return null;
  await sb.from('verification_tokens').update({ used: true }).eq('token', token);
  return { report_id: row.report_id, email: row.email };
}
