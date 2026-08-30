create table if not exists public.place_photos (
  id uuid primary key default gen_random_uuid(),
  query text not null unique,
  google_place_id text,
  photo_url text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

grant select on public.place_photos to anon;
grant select on public.place_photos to authenticated;
grant all on public.place_photos to service_role;

alter table public.place_photos enable row level security;

create policy "place_photos_select_all"
  on public.place_photos
  for select
  using (true);

create policy "place_photos_bucket_public_read"
  on storage.objects
  for select
  using (bucket_id = 'place-photos');