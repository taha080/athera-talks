import { cn } from '../lib/cn'
import type { ThemeName } from '../lib/theme'
import { useTheme } from '../context/ThemeContext'

const options: { id: ThemeName; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'naruto', label: 'Naruto' },
]

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-mist">Theme</span>
      <div className="grid grid-cols-2 rounded-full bg-ink/70 p-1 text-xs font-semibold" role="group" aria-label="Theme">
        {options.map((option) => {
          const active = theme === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(option.id)}
              className={cn(
                'rounded-full px-3 py-1.5 transition',
                active ? 'bg-gradient-to-r from-sakura to-violet text-white' : 'text-mist hover:text-paper',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
