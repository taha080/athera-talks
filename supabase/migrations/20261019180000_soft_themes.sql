-- Soft & Pretty themes and their matching wallpapers.

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check
  check (theme in (
    'dark', 'naruto', 'midnight', 'sakura', 'ocean', 'forest', 'light', 'amoled',
    'blush', 'lavender', 'peach', 'rosegold', 'cotton', 'mint', 'blossom', 'coquette'
  ));

alter table public.profiles drop constraint if exists profiles_wallpaper_check;
alter table public.profiles
  add constraint profiles_wallpaper_check
  check (wallpaper in (
    'plain', 'ink', 'paper', 'accent',
    'waves', 'hemp', 'diamonds', 'stripes', 'dots', 'petals', 'mist', 'grid', 'stars', 'leaves',
    'blush', 'lavender', 'peach', 'rosegold', 'cotton', 'mint', 'blossom', 'coquette',
    'custom'
  ));
