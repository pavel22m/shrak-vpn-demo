create table if not exists profiles (
  telegram_id text primary key,
  username text not null default '',
  first_name text not null default 'Гость',
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id text primary key,
  name text not null,
  days integer not null check (days > 0),
  price numeric(12, 2) not null check (price >= 0),
  description text not null default '',
  active boolean not null default true
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null references profiles(telegram_id),
  type text not null check (type in ('top_up', 'purchase', 'grant')),
  amount numeric(12, 2) not null,
  label text not null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null references profiles(telegram_id),
  plan_id text not null references plans(id),
  status text not null default 'active',
  expires_at timestamptz not null,
  demo_config text not null default 'demo://wireguard/shrak-vpn-example',
  created_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null references profiles(telegram_id),
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

insert into plans (id, name, days, price, description) values
  ('week', 'Старт', 7, 149, 'Попробовать без долгих обязательств'),
  ('month', 'Месяц', 30, 399, 'Оптимальный тариф на каждый день'),
  ('quarter', '90 дней', 90, 899, 'Максимальная выгода для постоянного доступа')
on conflict (id) do nothing;

alter table profiles enable row level security;
alter table plans enable row level security;
alter table transactions enable row level security;
alter table subscriptions enable row level security;
alter table support_tickets enable row level security;
-- Application API uses the server-only service role after validating Telegram initData.
