-- Supabase şeması: SQL Editor'de çalıştırın.
-- Tablolar: reports (UUID bazlı geçici rapor), leads (e-posta listesi),
-- verification_tokens (double opt-in), usage_log (kota sayacı)

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  place_url text not null,
  place_key text not null,
  business_name text not null default '',
  reviews jsonb not null default '[]'::jsonb,
  full_report jsonb not null,
  preview jsonb not null,
  locale text not null default 'tr',
  mocked boolean not null default false,
  email_unlocked text,
  created_at timestamptz not null default now()
);
create index if not exists reports_place_key_idx on reports (place_key, created_at desc);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  report_id uuid references reports(id) on delete set null,
  locale text not null default 'tr',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(email)
);

create table if not exists verification_tokens (
  token text primary key,
  report_id uuid not null references reports(id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists usage_log (
  id bigint generated always as identity primary key,
  ip text not null,
  place_key text not null,
  log_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists usage_log_date_idx on usage_log (log_date);
create index if not exists usage_log_ip_idx on usage_log (ip, created_at desc);

-- ── GÜVENLİK: Row Level Security ─────────────────────────────────
-- Uygulama DB'ye service_role ile bağlanır (RLS'yi bypass eder).
-- Politika TANIMLANMADAN RLS açılırsa anon/authenticated rolleri
-- hiçbir satırı okuyamaz/yazamaz → lead e-postaları korunur.
-- NOT: Tablolar daha önce oluşturulduysa bu dosyayı SQL Editor'de
-- TEKRAR çalıştırmanız yeterli (if not exists + alter güvenlidir).
alter table reports enable row level security;
alter table leads enable row level security;
alter table verification_tokens enable row level security;
alter table usage_log enable row level security;

-- Kemer + pantolon askısı: anon/authenticated rollerinden tüm yetkileri al.
-- (Politika yokken zaten deny olur; bu satırlar yanlışlıkla eklenen
--  permissive policy'lere karşı ek güvencedir.)
revoke all on reports, leads, verification_tokens, usage_log from anon, authenticated;
grant all on reports, leads, verification_tokens, usage_log to service_role;
