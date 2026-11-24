-- Past weekly top-three awards are derived from immutable weekly scores.
create or replace function public.rap_weekly_awards()
returns table (
  fid bigint,
  week_start date,
  badge_rank bigint,
  code_score bigint,
  community_score bigint,
  total_score bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  with weekly_totals as (
    select date_trunc('week', p.active_date::timestamp)::date as week_start,
           s.fid,
           sum(s.score_code)::bigint as code_score,
           sum(s.score_community)::bigint as community_score,
           sum(s.score_code + s.score_community)::bigint as total_score
      from public.rap_submissions s
      join public.rap_daily_prompts p on p.id = s.prompt_id
     where date_trunc('week', p.active_date::timestamp)::date <
           date_trunc('week', now() at time zone 'UTC')::date
     group by 1, 2
  ),
  ranked_awards as (
    select weekly_totals.*,
           row_number() over (
             partition by week_start
             order by total_score desc, fid asc
           ) as badge_rank
      from weekly_totals
  )
  select ranked_awards.fid,
         ranked_awards.week_start,
         ranked_awards.badge_rank,
         ranked_awards.code_score,
         ranked_awards.community_score,
         ranked_awards.total_score
    from ranked_awards
   where ranked_awards.badge_rank <= 3
   order by ranked_awards.week_start desc, ranked_awards.badge_rank asc;
$$;

revoke all on function public.rap_weekly_awards() from public, anon, authenticated;
grant execute on function public.rap_weekly_awards() to service_role;
