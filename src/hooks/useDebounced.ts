import { useEffect, useState } from 'react'

/** Trails `value` by `ms` while it keeps changing (e.g. during typing); the first value is immediate. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(settled, value)) return
    const t = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(t)
  }, [value, settled, ms])
  return settled
}
