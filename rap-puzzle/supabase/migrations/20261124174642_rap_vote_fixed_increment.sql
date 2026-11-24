-- The live game awards social votes in 10-point increments.
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
  if p_fid is null or p_fid <= 0 or p_points is distinct from 10 then
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

  if not exists (
    select 1
      from public.rap_player_day_state player_state
     where player_state.prompt_id = v_prompt_id
       and player_state.fid = p_fid
       and player_state.is_complete
  ) then
    raise exception 'feed_locked';
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

revoke all on function public.rap_allocate_social_points(bigint, uuid, smallint)
  from public, anon, authenticated;
grant execute on function public.rap_allocate_social_points(bigint, uuid, smallint)
  to service_role;
