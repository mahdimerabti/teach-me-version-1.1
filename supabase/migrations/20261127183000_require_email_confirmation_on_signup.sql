-- Remove automatic email confirmation from before_auth_user_created()
-- so email/password signups require clicking the confirmation email link
-- while keeping GoTrue token column NULL-normalization intact.
create or replace function public.before_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.confirmation_token         := coalesce(new.confirmation_token, '');
  new.recovery_token             := coalesce(new.recovery_token, '');
  new.email_change_token_new     := coalesce(new.email_change_token_new, '');
  new.email_change               := coalesce(new.email_change, '');
  new.email_change_token_current := coalesce(new.email_change_token_current, '');
  new.phone_change               := coalesce(new.phone_change, '');
  new.phone_change_token         := coalesce(new.phone_change_token, '');
  new.reauthentication_token     := coalesce(new.reauthentication_token, '');
  return new;
end;
$$;
