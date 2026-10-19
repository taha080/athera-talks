export type AppMode = 'setup' | 'demo' | 'live'

// Keys win. A stored demo flag must not pull a configured build back to the sample circle.
export function startMode(configured: boolean, demoStored: boolean): AppMode {
  if (configured) return 'live'
  if (demoStored) return 'demo'
  return 'setup'
}
