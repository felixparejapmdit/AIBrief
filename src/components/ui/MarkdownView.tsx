import { memo, useEffect, useMemo, useState, type ReactElement } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]

/*
 * Performance notes
 * -----------------
 * react-markdown (+ remark-gfm) parses a whole document inside one (uninterruptible) render. A full brief is
 * ~12 KB, so re-parsing it on every keystroke or every step switch causes visible jank on modest
 * hardware. Instead the document is split at its "## " section boundaries:
 *   • each section is its own memoised ReactMarkdown, so typing re-parses only the edited section;
 *   • rendered sections are kept in a small LRU cache, so switching steps never re-parses;
 *   • sections below the first few are rendered over the next animation frames (they start out of
 *     view, so nothing visibly changes).
 * Every brief section is self-contained Markdown (lists and GFM tables never span "## " headings),
 * so splitting cannot change the rendered output.
 */

const CACHE_LIMIT = 80
const cache = new Map<string, ReactElement>()

function renderChunk(markdown: string): ReactElement {
  const hit = cache.get(markdown)
  if (hit) {
    cache.delete(markdown)
    cache.set(markdown, hit)
    return hit
  }
  // react-markdown's `Markdown` is synchronous and hook-free, so calling it directly yields the
  // rendered element tree — caching that tree means a remount costs DOM creation only, no parsing.
  const el = Markdown({ children: markdown, remarkPlugins: REMARK_PLUGINS })
  cache.set(markdown, el)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  return el
}

function splitMarkdownSections(markdown: string): string[] {
  const out: string[] = []
  let current: string[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence
    if (!inFence && /^##\s/.test(line) && current.length) {
      out.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  if (current.length) out.push(current.join('\n'))
  return out
}

const Chunk = memo(function Chunk({ markdown }: { markdown: string }) {
  return renderChunk(markdown)
})

const INITIAL_CHUNKS = 3

export const MarkdownView = memo(function MarkdownView({ markdown, className = 'brief-md' }: { markdown: string; className?: string }) {
  const chunks = useMemo(() => splitMarkdownSections(markdown), [markdown])
  // Render the first sections immediately and the rest over the next frames.
  const [visible, setVisible] = useState(() => (chunks.every((c) => cache.has(c)) ? chunks.length : INITIAL_CHUNKS))
  useEffect(() => {
    if (visible >= chunks.length) return
    const id = requestAnimationFrame(() => setVisible((v) => Math.min(chunks.length, v + 2)))
    return () => cancelAnimationFrame(id)
  }, [visible, chunks.length])

  return (
    <div className={className} data-rendered={visible >= chunks.length ? 'complete' : 'partial'}>
      {chunks.slice(0, visible).map((c, i) => (
        <Chunk key={i} markdown={c} />
      ))}
    </div>
  )
})
