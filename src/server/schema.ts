/** Repeatable startup schema; Next.js never accesses this database. */
export const SCHEMA = `
create table if not exists guests (
  id uuid primary key, nick text not null, color text not null,
  created_at timestamptz not null default now()
);
create table if not exists positions (
  guest uuid not null references guests(id), lang text not null, cell text not null,
  wall int not null, updated_at timestamptz not null default now(), primary key (guest, lang)
);
create table if not exists fog (
  lang text not null, chunk text not null, bits bit(1024) not null
);
alter table fog drop constraint if exists fog_pkey;
create index if not exists fog_chunk_hash on fog using hash (chunk);
create table if not exists notes (
  id bigserial primary key, lang text not null, chunk text not null, cell text not null,
  anchor jsonb, text text not null, author uuid not null references guests(id),
  created_at timestamptz not null default now(), forgotten boolean not null default false
);
drop index if exists notes_chunk;
create index if not exists notes_chunk_hash on notes using hash (chunk) where not forgotten;
create table if not exists messages (
  id bigserial primary key, lang text not null, author uuid not null references guests(id),
  text text not null, place jsonb, created_at timestamptz not null default now(),
  forgotten boolean not null default false
);
create index if not exists messages_lang on messages (lang, id desc) where not forgotten;
create table if not exists bans (guest uuid, ip text, created_at timestamptz not null default now());
`;
