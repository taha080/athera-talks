-- New accounts use the same neutral theme as the sign-up screen.
-- Accounts that already chose a theme, including Dark, are left as they are.

alter table public.profiles alter column theme set default 'light';
