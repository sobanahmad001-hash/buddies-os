-- Shared chat persistence for Trading Lab. Canonical SQL until CLI export is available.
begin;
alter table public.ai_sessions add column if not exists lab_context jsonb not null default '{}',
  add column if not exists lab_revision integer not null default 0,
  add column if not exists lab_draft text not null default '';
alter table public.ai_messages add column if not exists metadata jsonb not null default '{}',
  add column if not exists request_id uuid,
  add column if not exists sequence integer;
create unique index if not exists ai_messages_request_role on public.ai_messages(session_id,request_id,role) where request_id is not null;
create unique index if not exists ai_messages_sequence on public.ai_messages(session_id,sequence) where sequence is not null;
create index if not exists ai_messages_owner_session on public.ai_messages(user_id,session_id,created_at);
alter table public.ai_messages enable row level security;
-- Existing policies remain; the guard below also verifies the session's owner for Lab rows.
grant select,insert,update on public.ai_messages to authenticated;

create or replace function public.guard_lab_chat_message() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.ai_sessions%rowtype;
begin
  select * into s from public.ai_sessions where id=case when TG_OP='DELETE' then OLD.session_id else NEW.session_id end;
  if s.agent_type='trading_lab' then
    if TG_OP='DELETE' or current_setting('buddies.lab_chat_write',true) is distinct from 'on' then raise exception 'Use the saved chat workflow'; end if;
    if s.user_id is distinct from auth.uid() or NEW.user_id is distinct from s.user_id then raise exception 'Owned chat required' using errcode='42501'; end if;
    if TG_OP='UPDATE' and (NEW.id,NEW.user_id,NEW.session_id,NEW.role,NEW.request_id,NEW.sequence) is distinct from (OLD.id,OLD.user_id,OLD.session_id,OLD.role,OLD.request_id,OLD.sequence) then raise exception 'Message identity is immutable'; end if;
  end if;
  if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
drop trigger if exists guard_lab_chat_message on public.ai_messages;
create trigger guard_lab_chat_message before insert or update or delete on public.ai_messages for each row execute function public.guard_lab_chat_message();

create or replace function public.lab_chat_write(p_session_id uuid,p_request_id uuid,p_expected_revision integer,p_phase text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); s public.ai_sessions%rowtype; m public.ai_messages%rowtype; u public.ai_messages%rowtype;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_session_id::text,0));
  select * into s from public.ai_sessions where id=p_session_id and user_id=actor and agent_type='trading_lab' for update;
  if not found then
    if p_phase<>'begin' or p_expected_revision<>0 then raise exception 'Chat not found' using errcode='42501'; end if;
    insert into public.ai_sessions(id,user_id,title,agent_type) values(p_session_id,actor,left(p_payload->>'prompt',70),'trading_lab') returning * into s;
  end if;
  if coalesce(s.archived,false) then raise exception 'Chat is archived'; end if;
  perform set_config('buddies.lab_chat_write','on',true);
  if p_phase='draft' then
    if s.lab_revision<>p_expected_revision then raise exception 'Chat changed; reload' using errcode='40001'; end if;
    if length(coalesce(p_payload->>'draft',''))>8000 then raise exception 'Draft too long'; end if;
    update public.ai_sessions set lab_draft=coalesce(p_payload->>'draft','') where id=s.id returning * into s;
    return jsonb_build_object('session',to_jsonb(s));
  end if;
  select * into m from public.ai_messages where session_id=s.id and user_id=actor and request_id=p_request_id and role='assistant';
  if p_phase='begin' then
    if found then
      select * into u from public.ai_messages where session_id=s.id and user_id=actor and request_id=p_request_id and role='user';
      if u.content is distinct from p_payload->>'prompt' or u.metadata->'context' is distinct from p_payload->'context' then raise exception 'Request belongs to a different message' using errcode='40001'; end if;
      return jsonb_build_object('session',to_jsonb(s),'message',to_jsonb(m));
    end if;
    if s.lab_revision<>p_expected_revision then raise exception 'Chat changed; reload' using errcode='40001'; end if;
    if exists(select 1 from public.ai_messages where session_id=s.id and metadata->>'status' in ('pending','executing')) then raise exception 'Finish or retry the pending response/action first' using errcode='40001'; end if;
    if coalesce(length(btrim(p_payload->>'prompt')),0) not between 1 and 8000 or jsonb_typeof(p_payload->'context') is distinct from 'object' then raise exception 'Invalid message'; end if;
    insert into public.ai_messages(user_id,session_id,role,content,request_id,sequence,metadata) values(actor,s.id,'user',p_payload->>'prompt',p_request_id,s.lab_revision+1,jsonb_build_object('context',p_payload->'context'));
    insert into public.ai_messages(user_id,session_id,role,content,request_id,sequence,metadata) values(actor,s.id,'assistant','',p_request_id,s.lab_revision+2,'{"status":"pending"}') returning * into m;
    update public.ai_sessions set lab_revision=lab_revision+2,lab_context=p_payload->'context',lab_draft='',updated_at=clock_timestamp(),last_message_at=clock_timestamp(),message_count=coalesce(message_count,0)+2 where id=s.id returning * into s;
  elsif p_phase='complete' then
    if m.id is null then raise exception 'Response not found' using errcode='42501'; end if;
    if m.metadata->>'status'='pending' then
      if coalesce(length(p_payload->>'content'),0)>40000 or coalesce(p_payload->>'status','') not in ('ready','error') then raise exception 'Invalid response'; end if;
      update public.ai_messages set content=coalesce(p_payload->>'content',''),metadata=p_payload-'content' where id=m.id returning * into m;
      if p_payload->>'model' is not null and p_payload->'usage' is not null then
        insert into public.ai_usage(id,user_id,model,input_tokens,output_tokens,cost_usd,message_type,session_id)
          values(m.id,actor,p_payload->>'model',greatest(0,coalesce((p_payload->'usage'->>'inputTokens')::integer,0)),greatest(0,coalesce((p_payload->'usage'->>'outputTokens')::integer,0)),greatest(0,coalesce((p_payload->'usage'->>'costUsd')::numeric,0)),'analysis',s.id)
          on conflict(id) do nothing;
      end if;
      update public.ai_sessions set updated_at=clock_timestamp() where id=s.id;
    end if;
  elsif p_phase='claim_action' then
    if m.id is null or jsonb_typeof(m.metadata->'action') is distinct from 'object' then raise exception 'Saved action not found'; end if;
    if m.metadata->>'status'='action_failed' then update public.ai_messages set metadata=metadata||'{"status":"executing"}'::jsonb where id=m.id returning * into m; end if;
    if m.metadata->>'status' in ('executing','executed') then return jsonb_build_object('session',to_jsonb(s),'message',to_jsonb(m)); end if;
    if s.lab_revision<>p_expected_revision or m.sequence<>s.lab_revision or m.metadata->>'status'<>'ready' then raise exception 'Proposal is stale; ask for an updated proposal' using errcode='40001'; end if;
    update public.ai_messages set metadata=metadata||'{"status":"executing"}'::jsonb where id=m.id returning * into m;
  elsif p_phase='receipt' then
    if m.id is null or m.metadata->>'status' not in ('executing','executed') then raise exception 'Action was not claimed'; end if;
    if m.metadata->>'status'='executing' then
      update public.ai_messages set metadata=metadata||jsonb_build_object('status','executed','receipt',p_payload) where id=m.id returning * into m;
    end if;
  elsif p_phase='action_error' then
    if m.id is null or m.metadata->>'status'<>'executing' then raise exception 'Action was not claimed'; end if;
    -- Preserve the approved identity for recovery, while allowing corrective conversation.
    update public.ai_messages set metadata=metadata||jsonb_build_object('status','action_failed','error',left(p_payload->>'error',1000)) where id=m.id returning * into m;
  else raise exception 'Unknown chat operation'; end if;
  return jsonb_build_object('session',to_jsonb(s),'message',to_jsonb(m));
end $$;
revoke all on function public.lab_chat_write(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.lab_chat_write(uuid,uuid,integer,text,jsonb) to authenticated;
revoke all on function public.guard_lab_chat_message() from public,anon,authenticated;
commit;
