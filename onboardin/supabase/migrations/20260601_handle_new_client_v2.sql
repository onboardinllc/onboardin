-- Update trigger function to capture jurisdiction + entity from signup metadata
create or replace function public.handle_new_client()
returns trigger language plpgsql security definer as $$
begin
  insert into public.clients (
    id, email, company_name, founder_name, funding_stage,
    country, jurisdiction, entity_type, business_intent, sells_to
  )
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'company_name', ''),
    coalesce(new.raw_user_meta_data->>'founder_name', ''),
    coalesce(new.raw_user_meta_data->>'funding_stage', ''),
    new.raw_user_meta_data->>'country',
    new.raw_user_meta_data->>'jurisdiction',
    new.raw_user_meta_data->>'entity_type',
    new.raw_user_meta_data->>'business_intent',
    new.raw_user_meta_data->>'sells_to'
  );
  return new;
end;
$$;
