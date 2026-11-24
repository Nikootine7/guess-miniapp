-- Keep an in-progress daily challenge immutable once a player has attempted it.
create or replace function public.rap_lock_prompt_after_attempt()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.rap_attempts a
     where a.prompt_id = old.id
  ) then
    raise exception 'prompt_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists rap_daily_prompt_locked_after_attempt on public.rap_daily_prompts;
create trigger rap_daily_prompt_locked_after_attempt
before update on public.rap_daily_prompts
for each row execute function public.rap_lock_prompt_after_attempt();

revoke all on function public.rap_lock_prompt_after_attempt() from public, anon, authenticated;

-- Serialize only access to the prompt row so an admin update cannot race a submission.
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
   limit 1
   for share;

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

revoke all on function public.rap_submit_attempt(bigint, text, text) from public, anon, authenticated;
grant execute on function public.rap_submit_attempt(bigint, text, text) to service_role;
