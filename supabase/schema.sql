create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 32),
  display_name text not null default 'Seyami member' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_url text,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  created_at timestamptz not null default now(),
  constraint posts_have_content check (body <> '' or image_url is not null)
);

alter table public.posts add column if not exists media_type text not null default 'image';
alter table public.posts drop constraint if exists posts_media_type_check;
alter table public.posts add constraint posts_media_type_check check (media_type in ('image', 'video'));

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_cannot_follow_self check (follower_id <> following_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  kind text not null check (kind in ('like', 'comment', 'follow')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_no_self_activity check (recipient_id <> actor_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists stories_expires_at_idx on public.stories (expires_at);
create index if not exists follows_following_id_idx on public.follows (following_id);
create index if not exists messages_conversation_created_at_idx on public.messages (conversation_id, created_at);
create index if not exists comments_post_created_at_idx on public.comments (post_id, created_at);
create index if not exists notifications_recipient_created_at_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_recipient_idx on public.notifications (recipient_id) where read_at is null;

create or replace function public.notify_post_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  post_owner_id uuid;
  activity_kind text;
begin
  activity_kind := case when tg_table_name = 'likes' then 'like' else 'comment' end;
  select user_id into post_owner_id from public.posts where id = new.post_id;
  if post_owner_id is not null and post_owner_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, post_id, kind)
    values (post_owner_id, new.user_id, new.post_id, activity_kind);
  end if;
  return new;
end;
$$;

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.follower_id <> new.following_id then
    insert into public.notifications (recipient_id, actor_id, kind)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = pg_catalog, public, auth
as $$
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
$$;

drop trigger if exists notify_post_like on public.likes;
create trigger notify_post_like
  after insert on public.likes
  for each row execute function public.notify_post_activity();
drop trigger if exists notify_post_comment on public.comments;
create trigger notify_post_comment
  after insert on public.comments
  for each row execute function public.notify_post_activity();
drop trigger if exists notify_new_follower on public.follows;
create trigger notify_new_follower
  after insert on public.follows
  for each row execute function public.notify_new_follower();

revoke all on function public.notify_post_activity() from public, anon, authenticated;
revoke all on function public.notify_new_follower() from public, anon, authenticated;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-z0-9_]', '', 'g'));
  if char_length(requested_username) < 3 then
    requested_username := 'user_' || substr(new.id::text, 1, 8);
  elsif exists (select 1 from public.profiles where username = requested_username) then
    requested_username := left(requested_username, 23) || '_' || substr(new.id::text, 1, 8);
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    requested_username,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Seyami member')
  );
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = target_conversation_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  found_conversation_id uuid;
begin
  if current_user_id is null or other_user_id is null or other_user_id = current_user_id then
    raise exception 'Choose another signed-in user to message.';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'That user does not exist.';
  end if;

  select mine.conversation_id into found_conversation_id
  from public.conversation_participants as mine
  join public.conversation_participants as theirs
    on theirs.conversation_id = mine.conversation_id
  where mine.user_id = current_user_id
    and theirs.user_id = other_user_id
  limit 1;

  if found_conversation_id is not null then
    return found_conversation_id;
  end if;

  insert into public.conversations default values returning id into found_conversation_id;
  insert into public.conversation_participants (conversation_id, user_id)
    values (found_conversation_id, current_user_id), (found_conversation_id, other_user_id);
  return found_conversation_id;
end;
$$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;
revoke all on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.stories enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

grant usage on schema public to authenticated;
revoke all on public.profiles, public.posts, public.stories, public.comments, public.likes,
  public.follows, public.notifications, public.conversations,
  public.conversation_participants, public.messages from public, anon;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.posts to authenticated;
grant update on public.posts to authenticated;
grant select, insert, delete on public.stories to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select on public.notifications to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Signed-in users can read profiles" on public.profiles;
create policy "Signed-in users can read profiles"
  on public.profiles for select to authenticated using (true);
drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Signed-in users can read posts" on public.posts;
create policy "Signed-in users can read posts"
  on public.posts for select to authenticated using (true);
drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete to authenticated using (user_id = auth.uid());
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
  on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Signed-in users can read active stories" on public.stories;
create policy "Signed-in users can read active stories"
  on public.stories for select to authenticated using (expires_at > now());
drop policy if exists "Users can create their own stories" on public.stories;
create policy "Users can create their own stories"
  on public.stories for insert to authenticated
  with check (
    user_id = auth.uid()
    and expires_at > now()
    and expires_at <= now() + interval '24 hours 5 minutes'
  );
drop policy if exists "Users can delete their own stories" on public.stories;
create policy "Users can delete their own stories"
  on public.stories for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Signed-in users can read comments" on public.comments;
create policy "Signed-in users can read comments"
  on public.comments for select to authenticated using (true);
drop policy if exists "Users can create comments as themselves" on public.comments;
create policy "Users can create comments as themselves"
  on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Signed-in users can read likes" on public.likes;
create policy "Signed-in users can read likes"
  on public.likes for select to authenticated using (true);
drop policy if exists "Users can like posts as themselves" on public.likes;
create policy "Users can like posts as themselves"
  on public.likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Users can remove their own likes"
  on public.likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Signed-in users can read follows" on public.follows;
create policy "Signed-in users can read follows"
  on public.follows for select to authenticated using (true);
drop policy if exists "Users can follow others as themselves" on public.follows;
create policy "Users can follow others as themselves"
  on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and follower_id <> following_id);
drop policy if exists "Users can unfollow others as themselves" on public.follows;
create policy "Users can unfollow others as themselves"
  on public.follows for delete to authenticated using (follower_id = auth.uid());

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "Participants can read their conversations" on public.conversations;
create policy "Participants can read their conversations"
  on public.conversations for select to authenticated using (public.is_conversation_member(id));

drop policy if exists "Participants can read conversation members" on public.conversation_participants;
create policy "Participants can read conversation members"
  on public.conversation_participants for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
  on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Participants can send messages as themselves" on public.messages;
create policy "Participants can send messages as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

grant usage on schema storage to anon, authenticated;
grant select on table storage.objects to anon, authenticated;
grant insert, update, delete on table storage.objects to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view post images" on storage.objects;
create policy "Anyone can view post images"
  on storage.objects for select to public using (bucket_id = 'post-images');
drop policy if exists "Users can upload their own post images" on storage.objects;
create policy "Users can upload their own post images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update their own post images" on storage.objects;
create policy "Users can update their own post images"
  on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can delete their own post images" on storage.objects;
create policy "Users can delete their own post images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone can view stories" on storage.objects;
drop policy if exists "Signed-in users can view active story media" on storage.objects;
create policy "Signed-in users can view active story media"
  on storage.objects for select to authenticated using (
    bucket_id = 'stories'
    and exists (
      select 1
      from public.stories
      where expires_at > now()
        and (
          media_url = storage.objects.name
          or right(media_url, char_length('/object/public/stories/' || storage.objects.name))
            = '/object/public/stories/' || storage.objects.name
        )
    )
  );
drop policy if exists "Users can upload their own stories" on storage.objects;
create policy "Users can upload their own stories"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can delete their own stories" on storage.objects;
create policy "Users can delete their own stories"
  on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
