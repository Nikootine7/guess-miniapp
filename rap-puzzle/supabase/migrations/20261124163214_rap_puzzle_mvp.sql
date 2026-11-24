-- RapPuzzle tables are isolated from the existing rap-meme schema.
create extension if not exists pgcrypto;

create table if not exists public.rap_daily_prompts (
  id uuid primary key default gen_random_uuid(),
  active_date date not null unique,
  opening_line text not null,
  target_rhyme_word text not null,
  accepted_end_words text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint daily_prompt_opening_line_length check (char_length(opening_line) between 1 and 500),
  constraint daily_prompt_rhyme_word_length check (char_length(target_rhyme_word) between 1 and 100)
);

create table if not exists public.rap_player_day_state (
  prompt_id uuid not null references public.rap_daily_prompts(id) on delete cascade,
  fid bigint not null check (fid > 0),
  attempts_used smallint not null default 0 check (attempts_used between 0 and 3),
  is_complete boolean not null default false,
  code_score smallint not null default 0 check (code_score in (0, 10, 30, 50)),
  updated_at timestamptz not null default now(),
  primary key (prompt_id, fid)
);

create table if not exists public.rap_attempts (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.rap_daily_prompts(id) on delete cascade,
  fid bigint not null check (fid > 0),
  attempt_number smallint not null check (attempt_number between 1 and 3),
  verse text not null check (char_length(btrim(verse)) between 1 and 280),
  end_word text not null,
  is_correct boolean not null,
  code_score smallint not null check (code_score in (0, 10, 30, 50)),
  created_at timestamptz not null default now(),
  unique (prompt_id, fid, attempt_number)
);

create table if not exists public.rap_submissions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.rap_daily_prompts(id) on delete cascade,
  fid bigint not null check (fid > 0),
  submission_text text not null check (char_length(btrim(submission_text)) between 1 and 280),
  attempts_used smallint not null check (attempts_used between 1 and 3),
  score_code smallint not null check (score_code in (0, 10, 30, 50)),
  is_wildcard boolean not null default false,
  score_community integer not null default 0 check (score_community >= 0),
  created_at timestamptz not null default now(),
  unique (prompt_id, fid)
);

create table if not exists public.rap_voting_budgets (
  prompt_id uuid not null references public.rap_daily_prompts(id) on delete cascade,
  voter_fid bigint not null check (voter_fid > 0),
  points_used smallint not null default 0 check (points_used between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (prompt_id, voter_fid)
);

create table if not exists public.rap_votes (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.rap_daily_prompts(id) on delete cascade,
  voter_fid bigint not null check (voter_fid > 0),
  submission_id uuid not null references public.rap_submissions(id) on delete cascade,
  points_allocated smallint not null check (points_allocated > 0),
  created_at timestamptz not null default now(),
  unique (prompt_id, voter_fid, submission_id)
);

create index if not exists rap_submissions_prompt_score_idx
  on public.rap_submissions (prompt_id, score_community asc, created_at desc);
create index if not exists rap_submissions_fid_idx
  on public.rap_submissions (fid);
create index if not exists rap_daily_prompts_active_date_idx
  on public.rap_daily_prompts (active_date desc);

alter table public.rap_daily_prompts enable row level security;
alter table public.rap_player_day_state enable row level security;
alter table public.rap_attempts enable row level security;
alter table public.rap_submissions enable row level security;
alter table public.rap_voting_budgets enable row level security;
alter table public.rap_votes enable row level security;

revoke all on public.rap_daily_prompts, public.rap_player_day_state, public.rap_attempts,
  public.rap_submissions, public.rap_voting_budgets, public.rap_votes
  from public, anon, authenticated;

grant all on public.rap_daily_prompts, public.rap_player_day_state, public.rap_attempts,
  public.rap_submissions, public.rap_voting_budgets, public.rap_votes
  to service_role;

create or replace function public.rap_submit_attempt(
  p_fid bigint,
  p_verse text,
  p_end_word text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prompt public.rap_daily_prompts%rowtype;
  v_attempts smallint;
  v_is_complete boolean;
  v_attempt_number smallint;
  v_correct boolean;
  v_score smallint;
  v_completed boolean;
  v_submission_id uuid;
begin
  if p_fid is null or p_fid <= 0
    or p_verse is null
    or char_length(btrim(p_verse)) < 1
    or char_length(btrim(p_verse)) > 280
    or p_end_word is null
    or char_length(btrim(p_end_word)) < 1 then
    raise exception 'invalid_verse';
  end if;

  select *
    into v_prompt
    from public.rap_daily_prompts
   where active_date = (now() at time zone 'UTC')::date
   limit 1;

  if not found then
    raise exception 'no_active_prompt';
  end if;

  insert into public.rap_player_day_state (prompt_id, fid)
  values (v_prompt.id, p_fid)
  on conflict (prompt_id, fid) do nothing;

  select attempts_used, is_complete
    into v_attempts, v_is_complete
    from public.rap_player_day_state
   where prompt_id = v_prompt.id and fid = p_fid
   for update;

  if v_is_complete or v_attempts >= 3 then
    raise exception 'attempts_locked';
  end if;

  v_attempt_number := v_attempts + 1;
  v_correct := exists (
    select 1
      from unnest(v_prompt.accepted_end_words) as candidate(word)
     where lower(btrim(candidate.word)) = lower(btrim(p_end_word))
  );

  v_score := case
    when not v_correct then 0
    when v_attempt_number = 1 then 50
    when v_attempt_number = 2 then 30
    else 10
  end;
  v_completed := v_correct or v_attempt_number = 3;

  insert into public.rap_attempts (
    prompt_id, fid, attempt_number, verse, end_word, is_correct, code_score
  ) values (
    v_prompt.id, p_fid, v_attempt_number, btrim(p_verse), btrim(p_end_word), v_correct, v_score
  );

  update public.rap_player_day_state
     set attempts_used = v_attempt_number,
         is_complete = v_completed,
         code_score = case when v_completed then v_score else 0 end,
         updated_at = now()
   where prompt_id = v_prompt.id and fid = p_fid;

  if v_completed then
    insert into public.rap_submissions (
      prompt_id, fid, submission_text, attempts_used, score_code, is_wildcard
    ) values (
      v_prompt.id, p_fid, btrim(p_verse), v_attempt_number, v_score, not v_correct
    )
    returning id into v_submission_id;
  end if;

  return jsonb_build_object(
    'attempt_number', v_attempt_number,
    'attempts_left', 3 - v_attempt_number,
    'correct', v_correct,
    'code_score', v_score,
    'feed_unlocked', v_completed,
    'submission_id', v_submission_id
  );
end;
$$;

create or replace function public.rap_allocate_social_points(
  p_fid bigint,
  p_submission_id uuid,
  p_points smallint
)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prompt_id uuid;
  v_target_fid bigint;
  v_active_date date;
  v_points_used smallint;
begin
  if p_fid is null or p_fid <= 0 or p_points is null or p_points < 1 or p_points > 100 then
    raise exception 'invalid_vote';
  end if;

  select s.prompt_id, s.fid, p.active_date
    into v_prompt_id, v_target_fid, v_active_date
    from public.rap_submissions s
    join public.rap_daily_prompts p on p.id = s.prompt_id
   where s.id = p_submission_id;

  if not found or v_active_date <> (now() at time zone 'UTC')::date then
    raise exception 'invalid_submission';
  end if;
  if v_target_fid = p_fid then
    raise exception 'self_vote';
  end if;

  insert into public.rap_voting_budgets (prompt_id, voter_fid)
  values (v_prompt_id, p_fid)
  on conflict (prompt_id, voter_fid) do nothing;

  select points_used
    into v_points_used
    from public.rap_voting_budgets
   where prompt_id = v_prompt_id and voter_fid = p_fid
   for update;

  if v_points_used + p_points > 100 then
    raise exception 'vote_budget_exceeded';
  end if;

  insert into public.rap_votes (prompt_id, voter_fid, submission_id, points_allocated)
  values (v_prompt_id, p_fid, p_submission_id, p_points)
  on conflict (prompt_id, voter_fid, submission_id)
  do update set points_allocated = public.rap_votes.points_allocated + excluded.points_allocated,
                created_at = now();

  update public.rap_voting_budgets
     set points_used = points_used + p_points,
         updated_at = now()
   where prompt_id = v_prompt_id and voter_fid = p_fid
  returning points_used into v_points_used;

  update public.rap_submissions
     set score_community = score_community + p_points
   where id = p_submission_id;

  return v_points_used;
end;
$$;

create or replace function public.rap_weekly_leaderboard()
returns table (
  fid bigint,
  code_score bigint,
  community_score bigint,
  total_score bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select s.fid,
         sum(s.score_code)::bigint as code_score,
         sum(s.score_community)::bigint as community_score,
         sum(s.score_code + s.score_community)::bigint as total_score
    from public.rap_submissions s
    join public.rap_daily_prompts p on p.id = s.prompt_id
   where p.active_date >= date_trunc('week', now() at time zone 'UTC')::date
     and p.active_date <= (now() at time zone 'UTC')::date
   group by s.fid
   order by sum(s.score_code + s.score_community) desc, s.fid asc
   limit 50;
$$;

revoke all on function public.rap_submit_attempt(bigint, text, text) from public, anon, authenticated;
revoke all on function public.rap_allocate_social_points(bigint, uuid, smallint) from public, anon, authenticated;
revoke all on function public.rap_weekly_leaderboard() from public, anon, authenticated;

grant execute on function public.rap_submit_attempt(bigint, text, text) to service_role;
grant execute on function public.rap_allocate_social_points(bigint, uuid, smallint) to service_role;
grant execute on function public.rap_weekly_leaderboard() to service_role;

