import { useRef, useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type {
  GitDiffResult,
  GitDiffTextResult
} from '../../../../../../shared/git-diff-compare-types'
import type { DiffSection } from '../../diff-section-types'
import { useCombinedDiffEntrySet } from '../resolve-changes/use-combined-diff-entry-set'
import { createCombinedDiffSectionIndexMap } from '../resolve-changes/combined-diff-section-identity'
import { useCombinedDiffViewRestore } from '../remember-view/use-combined-diff-view-restore'
import { useCombinedDiffViewPersist } from '../remember-view/use-combined-diff-view-persist'
import { useCombinedDiffSectionLoadRegistry } from './combined-diff-section-load-registry'
import { useCombinedDiffSectionRetry } from './use-combined-diff-section-retry'
import { useCombinedDiffSectionRevalidation } from './use-combined-diff-section-revalidation'

const sectionFetch = vi.hoisted(() => vi.fn())
vi.mock('./fetch-combined-diff-section', () => ({ fetchCombinedDiffSection: sectionFetch }))
import { useCombinedDiffSectionLoader } from './use-combined-diff-section-loader'

export const mocks = { fetch: sectionFetch }

export const file: OpenFile = {
  id: 'metadata-retention',
  filePath: '/repo',
  relativePath: 'Changes',
  worktreeId: 'wt',
  isDirty: false,
  language: 'plaintext',
  mode: 'diff',
  diffSource: 'combined-uncommitted'
}
const noBranchEntries = []

export type Review = { status: GitStatusEntry[]; file: OpenFile; viewStateKey: string }

function useReview(props: Review) {
  const [sections, setSections] = useState<DiffSection[]>([])
  const [sectionHeights, setSectionHeights] = useState<Record<number, number>>({})
  const [generation, setGeneration] = useState(0)
  const [sideBySide, setSideBySide] = useState(false)
  const registry = useCombinedDiffSectionLoadRegistry(sections)
  const entrySet = useCombinedDiffEntrySet({
    file: props.file,
    gitStatusEntries: props.status,
    liveBranchEntries: noBranchEntries,
    sectionsRef: registry.sectionsRef
  })
  const restore = useCombinedDiffViewRestore({
    entrySet,
    file: props.file,
    gitStatusEntries: props.status,
    registry,
    setGeneration,
    setSectionHeights,
    setSections,
    setSideBySide,
    viewStateKey: props.viewStateKey
  })
  const loader = useCombinedDiffSectionLoader({
    entrySet,
    file: props.file,
    generation,
    registry,
    sectionCount: sections.length,
    setSectionHeights,
    setSections
  })
  const retry = useCombinedDiffSectionRetry({
    invalidateViewStateCache: restore.invalidateViewStateCache,
    registry,
    setSectionHeights,
    setSections
  })
  const sectionIndexByKeyRef = useRef<ReadonlyMap<string, number>>(new Map())
  sectionIndexByKeyRef.current = createCombinedDiffSectionIndexMap(sections)
  const signature = useCombinedDiffSectionRevalidation({
    file: props.file,
    gitStatusEntries: props.status,
    registry,
    requestSectionReload: retry.requestSectionReload,
    sectionIndexByKeyRef,
    sectionEntries: entrySet.entries,
    shouldAutoReloadFromGitStatus: entrySet.shouldAutoReloadFromGitStatus,
    treeMode: entrySet.treeMode
  })
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  useCombinedDiffViewPersist({
    combinedGitStatusSignature: signature,
    entryCount: entrySet.entries.length,
    entrySignature: entrySet.entrySignature,
    loadedIndicesRef: registry.loadedIndicesRef,
    memoryLeaseRef: restore.memoryLeaseRef,
    scrollContainerRef,
    sectionHeights,
    sections,
    sideBySide,
    viewStateKey: props.viewStateKey
  })
  return {
    sections,
    setSections,
    sectionHeights,
    setSectionHeights,
    generation,
    registry,
    loader,
    restore,
    retry
  }
}

export function entries(count: number): GitStatusEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `file-${index}.ts`,
    area: 'unstaged',
    status: 'modified',
    added: 1
  }))
}

export async function flush(count = 10): Promise<void> {
  await act(async () => {
    for (let index = 0; index < count * 12 + 30; index += 1) {
      await Promise.resolve()
    }
  })
}

export function textResult(modifiedContent = 'after\n'): GitDiffTextResult {
  return {
    kind: 'text',
    originalContent: 'before\n',
    modifiedContent,
    originalIsBinary: false,
    modifiedIsBinary: false
  }
}

export function deferredResult() {
  let resolve!: (result: GitDiffResult) => void
  const promise = new Promise<GitDiffResult>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export function renderReview(review: Review) {
  return renderHook(useReview, { initialProps: review })
}

export async function visitAll(
  hook: ReturnType<typeof renderReview>,
  count: number
): Promise<void> {
  const renderedIndices = hook.result.current.registry.renderedIndicesRef.current
  for (let index = 0; index < count; index += 1) {
    act(() => {
      hook.result.current.registry.renderedIndicesRef.current = new Set([index])
      hook.result.current.loader.loadSection(index)
    })
    await flush()
  }
  hook.result.current.registry.renderedIndicesRef.current = renderedIndices
}

export async function advanceReloadTimer(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  await flush()
}
