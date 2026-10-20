-- New accounts open in Midnight. Accounts that already chose a theme stay on it.

alter table public.profiles alter column theme set default 'midnight';
