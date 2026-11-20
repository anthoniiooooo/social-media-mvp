-- Read-only verification for Seyami's database, policies, Storage, and Realtime.
-- Run after the migration in the Supabase SQL Editor. This script changes nothing.
with app_tables(schema_name, table_name) as (
  values
    ('public', 'profiles'),
    ('public', 'posts'),
    ('public', 'stories'),
    ('public', 'comments'),
    ('public', 'likes'),
    ('public', 'follows'),
    ('public', 'notifications'),
    ('public', 'conversations'),
    ('public', 'conversation_participants'),
    ('public', 'messages')
),
reports(check_type, item, details) as (
  select
    'table_privileges',
    t.schema_name || '.' || t.table_name,
    jsonb_build_object(
      'select', coalesce(has_table_privilege('authenticated', to_regclass(format('%I.%I', t.schema_name, t.table_name)), 'SELECT'), false),
      'insert', coalesce(has_table_privilege('authenticated', to_regclass(format('%I.%I', t.schema_name, t.table_name)), 'INSERT'), false),
      'update', coalesce(has_table_privilege('authenticated', to_regclass(format('%I.%I', t.schema_name, t.table_name)), 'UPDATE'), false),
      'delete', coalesce(has_table_privilege('authenticated', to_regclass(format('%I.%I', t.schema_name, t.table_name)), 'DELETE'), false),
      'anon_select', coalesce(has_table_privilege('anon', to_regclass(format('%I.%I', t.schema_name, t.table_name)), 'SELECT'), false)
    )
  from app_tables t

  union all

  select
    'rls_policies',
    t.schema_name || '.' || t.table_name,
    jsonb_build_object(
      'exists', c.oid is not null,
      'rls_enabled', coalesce(c.relrowsecurity, false),
      'policies', coalesce(p.policy_list, '[]'::jsonb)
    )
  from app_tables t
  left join pg_class c on c.oid = to_regclass(format('%I.%I', t.schema_name, t.table_name))
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'name', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'check', with_check
    )) as policy_list
    from pg_policies
    where schemaname = t.schema_name and tablename = t.table_name
  ) p on true

  union all

  select
    'table_columns',
    t.schema_name || '.' || t.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', c.column_name,
      'type', c.data_type,
      'nullable', c.is_nullable,
      'default', c.column_default
    ) order by c.ordinal_position) filter (where c.column_name is not null), '[]'::jsonb)
  from app_tables t
  left join information_schema.columns c
    on c.table_schema = t.schema_name and c.table_name = t.table_name
  group by t.schema_name, t.table_name

  union all

  select
    'table_constraints',
    t.schema_name || '.' || t.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', c.conname,
      'type', c.contype,
      'validated', c.convalidated,
      'definition', pg_get_constraintdef(c.oid)
    ) order by c.conname) filter (where c.oid is not null), '[]'::jsonb)
  from app_tables t
  left join pg_class tbl on tbl.oid = to_regclass(format('%I.%I', t.schema_name, t.table_name))
  left join pg_constraint c on c.conrelid = tbl.oid
  group by t.schema_name, t.table_name

  union all

  select
    'table_indexes',
    t.schema_name || '.' || t.table_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', i.indexname,
      'definition', i.indexdef
    ) order by i.indexname) filter (where i.indexname is not null), '[]'::jsonb)
  from app_tables t
  left join pg_indexes i on i.schemaname = t.schema_name and i.tablename = t.table_name
  group by t.schema_name, t.table_name

  union all

  select
    'function_privileges',
    function_name,
    jsonb_build_object(
      'exists', to_regprocedure(function_signature) is not null,
      'authenticated_execute', coalesce(has_function_privilege('authenticated', to_regprocedure(function_signature)::oid, 'EXECUTE'), false),
      'anon_execute', coalesce(has_function_privilege('anon', to_regprocedure(function_signature)::oid, 'EXECUTE'), false)
    )
  from (values
    ('public.get_or_create_conversation(uuid)', 'public.get_or_create_conversation(uuid)'),
    ('public.mark_notifications_read()', 'public.mark_notifications_read()'),
    ('public.is_conversation_member(uuid)', 'public.is_conversation_member(uuid)')
  ) functions(function_name, function_signature)

  union all

  select
    'realtime_publication',
    expected.table_name,
    jsonb_build_object(
      'published', exists (
        select 1 from pg_publication_tables p
        where p.pubname = 'supabase_realtime'
          and p.schemaname = 'public'
          and p.tablename = expected.table_name
      )
    )
  from (values ('messages'), ('notifications')) expected(table_name)

  union all

  select
    'storage_table_privileges',
    'storage.objects',
    jsonb_build_object(
      'storage_schema_usage_anon', has_schema_privilege('anon', 'storage', 'USAGE'),
      'storage_schema_usage_authenticated', has_schema_privilege('authenticated', 'storage', 'USAGE'),
      'anon_select', coalesce(has_table_privilege('anon', to_regclass('storage.objects'), 'SELECT'), false),
      'authenticated_select', coalesce(has_table_privilege('authenticated', to_regclass('storage.objects'), 'SELECT'), false),
      'authenticated_insert', coalesce(has_table_privilege('authenticated', to_regclass('storage.objects'), 'INSERT'), false),
      'authenticated_update', coalesce(has_table_privilege('authenticated', to_regclass('storage.objects'), 'UPDATE'), false),
      'authenticated_delete', coalesce(has_table_privilege('authenticated', to_regclass('storage.objects'), 'DELETE'), false)
    )

  union all

  select
    'storage_bucket',
    expected.id,
    jsonb_build_object(
      'exists', b.id is not null,
      'public', b.public,
      'stories_private', case when expected.id = 'stories' then b.public = false else null end,
      'file_size_limit', b.file_size_limit,
      'allowed_mime_types', b.allowed_mime_types
    )
  from (values ('post-images'), ('stories')) expected(id)
  left join storage.buckets b on b.id = expected.id

  union all

  select
    'storage_policies',
    'storage.objects',
    coalesce(jsonb_agg(jsonb_build_object(
      'name', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'check', with_check
    )), '[]'::jsonb)
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'

  union all

  select
    'posts_profiles_relationship',
    'public.posts.user_id -> public.profiles.id',
    coalesce(jsonb_agg(jsonb_build_object(
      'name', c.conname,
      'source_column', source_column.attname,
      'referenced_schema', referenced_schema.nspname,
      'referenced_table', referenced_table.relname,
      'referenced_column', referenced_column.attname,
      'matches_feed_relationship',
        source_schema.nspname = 'public'
        and source_table.relname = 'posts'
        and source_column.attname = 'user_id'
        and referenced_schema.nspname = 'public'
        and referenced_table.relname = 'profiles'
        and referenced_column.attname = 'id',
      'validated', c.convalidated,
      'definition', pg_get_constraintdef(c.oid)
    )), '[]'::jsonb)
  from pg_constraint c
  join pg_class source_table on source_table.oid = c.conrelid
  join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
  join pg_attribute source_column
    on source_column.attrelid = c.conrelid
    and source_column.attnum = c.conkey[1]
    and not source_column.attisdropped
  join pg_class referenced_table on referenced_table.oid = c.confrelid
  join pg_namespace referenced_schema on referenced_schema.oid = referenced_table.relnamespace
  join pg_attribute referenced_column
    on referenced_column.attrelid = c.confrelid
    and referenced_column.attnum = c.confkey[1]
    and not referenced_column.attisdropped
  where c.contype = 'f'
    and source_schema.nspname = 'public'
    and source_table.relname = 'posts'
    and cardinality(c.conkey) = 1
    and cardinality(c.confkey) = 1
)
select check_type, item, details
from reports
order by check_type, item;
