-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Notes table
create table if not exists notes (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default '',
  content text not null default '',
  tags text[] not null default '{}',
  folder_id uuid,
  pinned boolean not null default false,
  favorited boolean not null default false,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false
);

-- Folders table
create table if not exists folders (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  emoji text not null default '📁',
  parent_id uuid,
  sort_order int not null default 0,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- Sync metadata (track last sync time per device)
create table if not exists sync_meta (
  user_id uuid references auth.users(id) on delete cascade not null,
  device_id text not null,
  last_sync bigint not null default 0,
  primary key (user_id, device_id)
);

-- Indexes
create index if not exists idx_notes_user on notes(user_id);
create index if not exists idx_notes_updated on notes(user_id, updated_at);
create index if not exists idx_folders_user on folders(user_id);

-- Row Level Security
alter table notes enable row level security;
alter table folders enable row level security;
alter table sync_meta enable row level security;

-- Policies: users can only access their own data
create policy "Users can CRUD own notes" on notes
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can CRUD own folders" on folders
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can CRUD own sync_meta" on sync_meta
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable realtime for notes and folders
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table folders;
