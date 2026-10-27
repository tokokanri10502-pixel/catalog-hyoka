-- =========================================================
-- 予約カタログ評価  データベース定義
-- Supabase の SQL Editor に丸ごと貼って Run（新規プロジェクトで1回だけ）
-- ※ book-markers-v2 等とは別のSupabaseプロジェクトで実行すること
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- 基本設定（1行だけ）
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  title text not null default '予約カタログ評価',
  start_at timestamptz,
  end_at timestamptz
);
insert into settings (id) values (1) on conflict do nothing;

-- 催事
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 催事ごとの評価対象の社（A〜F…）
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  name text not null,
  is_self boolean not null default false,
  sort int not null default 0
);

-- 回答（ranks = {"overall":[社id…1位から順], "cover":[…], …}）
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  respondent_type text not null check (respondent_type in ('internal','external')),
  device_id text not null,
  ranks jsonb not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (event_id, device_id)
);

-- 管理画面パスワード（ハッシュのみ保存）
create table if not exists admin_secret (
  id int primary key default 1 check (id = 1),
  pw_hash text not null
);

alter table settings enable row level security;
alter table events enable row level security;
alter table companies enable row level security;
alter table responses enable row level security;
alter table admin_secret enable row level security;

-- 回答画面が読むもの（読み取りのみ公開）
drop policy if exists "read settings" on settings;
create policy "read settings" on settings for select to anon, authenticated using (true);
drop policy if exists "read active events" on events;
create policy "read active events" on events for select to anon, authenticated using (active);
drop policy if exists "read companies" on companies;
create policy "read companies" on companies for select to anon, authenticated using (true);
-- responses / admin_secret にはポリシーを作らない → 直接の読み書きは不可。下の関数経由のみ。

-- ---------------------------------------------------------
-- 回答者用
-- ---------------------------------------------------------
create or replace function submit_response(
  p_event uuid, p_type text, p_device text, p_ranks jsonb, p_comment text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  s settings;
  expected text[];
  k text;
  got text[];
begin
  select * into s from settings where id = 1;
  if s.start_at is not null and now() < s.start_at then raise exception '受付開始前です'; end if;
  if s.end_at is not null and now() > s.end_at then raise exception '受付は終了しました'; end if;
  if not exists (select 1 from events where id = p_event and active) then raise exception 'この催事は受付していません'; end if;
  if p_type not in ('internal','external') then raise exception '回答者区分が不正です'; end if;
  if coalesce(length(p_device),0) < 8 then raise exception '端末IDが不正です'; end if;

  select array_agg(id::text order by id::text) into expected from companies where event_id = p_event;
  foreach k in array array['overall','cover','mainpage','product','sizzle','copy','tone'] loop
    select array_agg(x order by x) into got from jsonb_array_elements_text(p_ranks -> k) x;
    if got is distinct from expected then raise exception '順位が全社分そろっていません（%）', k; end if;
  end loop;

  insert into responses (event_id, respondent_type, device_id, ranks, comment)
  values (p_event, p_type, p_device, p_ranks, left(coalesce(p_comment,''), 500));
exception when unique_violation then
  raise exception 'この催事は回答済みです';
end $$;

create or replace function get_answered(p_device text) returns uuid[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(event_id), '{}') from responses where device_id = p_device;
$$;

-- ---------------------------------------------------------
-- 管理者用（パスワード必須）
-- ---------------------------------------------------------
create or replace function _check_pw(p text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from admin_secret where pw_hash = crypt(p, pw_hash)) then
    raise exception 'パスワードが違います';
  end if;
end $$;
revoke execute on function _check_pw(text) from public, anon, authenticated;

create or replace function admin_load(p_pw text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _check_pw(p_pw);
  return jsonb_build_object(
    'settings', (select to_jsonb(s) from settings s where id = 1),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.sort, e.created_at) from events e), '[]'),
    'companies', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort) from companies c), '[]'),
    'responses', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'event_id', r.event_id, 'respondent_type', r.respondent_type,
        'ranks', r.ranks, 'comment', r.comment, 'created_at', r.created_at) order by r.created_at)
      from responses r), '[]')
  );
end $$;

create or replace function admin_save_settings(p_pw text, p_title text, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pw(p_pw);
  update settings set title = p_title, start_at = p_start, end_at = p_end where id = 1;
end $$;

create or replace function admin_save_event(p_pw text, p_id uuid, p_name text, p_sort int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  perform _check_pw(p_pw);
  if p_id is null then
    insert into events (name, sort, active) values (p_name, p_sort, p_active) returning id into new_id;
    return new_id;
  end if;
  update events set name = p_name, sort = p_sort, active = p_active where id = p_id;
  return p_id;
end $$;

create or replace function admin_delete_event(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pw(p_pw);
  delete from events where id = p_id;
end $$;

-- p_rows = [{"id":null|uuid,"label":"A","name":"…","is_self":true,"sort":0}, …]
create or replace function admin_save_companies(p_pw text, p_event uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform _check_pw(p_pw);
  delete from companies where event_id = p_event
    and id::text not in (select x->>'id' from jsonb_array_elements(p_rows) x where x->>'id' is not null);
  for r in select * from jsonb_array_elements(p_rows) loop
    if r->>'id' is null then
      insert into companies (event_id, label, name, is_self, sort)
      values (p_event, r->>'label', r->>'name', (r->>'is_self')::boolean, (r->>'sort')::int);
    else
      update companies set label = r->>'label', name = r->>'name',
        is_self = (r->>'is_self')::boolean, sort = (r->>'sort')::int
      where id = (r->>'id')::uuid and event_id = p_event;
    end if;
  end loop;
end $$;

create or replace function admin_delete_response(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pw(p_pw);
  delete from responses where id = p_id;
end $$;

create or replace function admin_change_password(p_pw text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _check_pw(p_pw);
  if length(p_new) < 6 then raise exception 'パスワードは6文字以上にしてください'; end if;
  update admin_secret set pw_hash = crypt(p_new, gen_salt('bf')) where id = 1;
end $$;

-- ---------------------------------------------------------
-- 初期データ
-- ---------------------------------------------------------
-- ▼ 最初の管理パスワード（'kari-pass' を好きな文字に変えてから Run。後で管理画面から変更可）
insert into admin_secret (id, pw_hash) values (1, extensions.crypt('kari-pass', extensions.gen_salt('bf')))
on conflict (id) do nothing;

-- ▼ 催事の初期登録（不要なら管理画面で削除・追加できます）
insert into events (name, sort)
select * from (values ('おせち',1),('クリスマス',2),('土用の丑',3),('母の日・父の日',4),('ボジョレーヌーボー',5)) v(name, sort)
where not exists (select 1 from events);
