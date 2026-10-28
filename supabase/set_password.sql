-- 管理画面の最初のパスワードを決める（schema.sql のあとに1回だけ Run）
-- 'ここにパスワード' の部分だけを書き換えてください（6文字以上。前後の ' は消さない）
-- 2回目以降の変更は、管理画面の「期間・設定」からできます
insert into admin_secret (id, pw_hash)
values (1, extensions.crypt('ここにパスワード', extensions.gen_salt('bf')))
on conflict (id) do update set pw_hash = excluded.pw_hash;
