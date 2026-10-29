// @vitest-environment happy-dom

import { act, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import {
  clearCombinedDiffViewMemory,
  readCombinedDiffViewMemory,
  rememberCombinedDiffView
} from '../remember-view/combined-diff-view-cache'
import {
  advanceReloadTimer,
  deferredResult,
  entries,
  file,
  flush,
  mocks,
  renderReview,
  textResult,
  visitAll,
  type Review
} from './combined-diff-review.test-fixture'

afterEach(() => {
  cleanup()
  clearCombinedDiffViewMemory()
  vi.restoreAllMocks()
  vi.useRealTimers()
  mocks.fetch.mockReset()
})

it.each([10, 100])('retains %i visited rows when one path changes metadata', async (count) => {
  mocks.fetch.mockResolvedValue(textResult())
  const initial = entries(count)
  const review: Review = { status: initial, file, viewStateKey: `metadata-${count}` }
  const hook = renderReview(review)
  await flush(count)
  await visitAll(hook, count)
  expect(hook.result.current.registry.loadedIndicesRef.current.size).toBe(count)
  act(() =>
    hook.result.current.setSectionHeights(
      Object.fromEntries(initial.map((_, index) => [index, 200]))
    )
  )
  const before = hook.result.current
  const changedIndex = Math.floor(count / 2)
  const changedStatus = initial.map((entry, index) =>
    index === changedIndex ? { ...entry, added: 2 } : entry
  )
  mocks.fetch.mockClear()

  hook.rerender({ ...review, status: changedStatus })
  await flush(count)
  expect(hook.result.current.generation).toBe(before.generation)
  expect(hook.result.current.sectionHeights).toBe(before.sectionHeights)
  for (let index = 0; index < count; index += 1) {
    if (index !== changedIndex) {
      expect(hook.result.current.sections[index]).toBe(before.sections[index])
    }
  }
  expect(hook.result.current.sections[changedIndex]?.added).toBe(2)
  await visitAll(hook, count)
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  expect(mocks.fetch.mock.calls[0]?.[0].entry.path).toBe(initial[changedIndex]?.path)
  expect(hook.result.current.registry.loadedIndicesRef.current.size).toBe(count)
  expect(readCombinedDiffViewMemory(review.viewStateKey)?.view?.entrySignature).toContain(
    '"added":2'
  )
})

it('preserves a sibling read and coalesces a visible changed row without resetting the queue', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = { status: entries(10), file, viewStateKey: 'in-flight-sibling' }
  const hook = renderReview(review)
  await visitAll(hook, 10)
  const sibling = deferredResult()
  mocks.fetch
    .mockClear()
    .mockReturnValueOnce(sibling.promise)
    .mockResolvedValue(textResult('updated'))
  hook.result.current.registry.renderedIndicesRef.current = new Set([7, 8])
  act(() => hook.result.current.retry.requestSectionReload(8))
  await advanceReloadTimer()
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  const before = hook.result.current
  const reset = vi.spyOn(before.registry.loadSchedulerRef.current, 'reset')
  const lease = before.restore.memoryLeaseRef.current
  const anchor = { key: 'unstaged:file-8.ts', offset: 40 }
  before.restore.scrollAnchorRef.current = anchor
  before.restore.latestDomScrollAnchorRef.current = anchor
  before.restore.scrollOffsetRef.current = 2000

  hook.rerender({
    ...review,
    status: review.status.map((entry, index) => (index === 7 ? { ...entry, added: 2 } : entry))
  })
  await advanceReloadTimer()
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  expect(hook.result.current.registry.loadingIndicesRef.current.has(8)).toBe(true)
  expect(hook.result.current.generation).toBe(before.generation)
  expect(hook.result.current.restore.memoryLeaseRef.current).toBe(lease)
  expect(hook.result.current.restore.scrollAnchorRef.current).toBe(anchor)
  expect(hook.result.current.restore.latestDomScrollAnchorRef.current).toBe(anchor)
  expect(hook.result.current.restore.scrollOffsetRef.current).toBe(2000)
  expect(reset).not.toHaveBeenCalled()
  await act(async () => {
    sibling.resolve(textResult('sibling settled'))
  })
  await flush()
  expect(mocks.fetch.mock.calls.map(([request]) => request.entry.path)).toEqual([
    'file-8.ts',
    'file-7.ts'
  ])
  expect(hook.result.current.sections[8]?.modifiedContent).toBe('sibling settled')
  expect(hook.result.current.sections[7]?.modifiedContent).toBe('updated')
  reset.mockRestore()
})

it('discards a changed in-flight read once and makes progress through repeated metadata invalidation', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const first = deferredResult()
  const second = deferredResult()
  const third = deferredResult()
  mocks.fetch
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(third.promise)
  const review: Review = { status: entries(1), file, viewStateKey: 'changed-in-flight' }
  const hook = renderReview(review)
  await flush()
  hook.result.current.registry.renderedIndicesRef.current.add(0)
  const generation = hook.result.current.generation
  const update = (added: number): Review => ({
    ...review,
    status: [{ ...review.status[0]!, added }]
  })
  hook.rerender(update(2))
  expect(hook.result.current.registry.sectionLoadTokensRef.current.get(0)).toBe(2)
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  await act(async () => {
    first.resolve(textResult('stale'))
  })
  await flush()
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('')
  await advanceReloadTimer()
  expect(mocks.fetch).toHaveBeenCalledTimes(2)
  hook.rerender(update(3))
  await act(async () => {
    second.resolve(textResult('progress'))
  })
  await flush()
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('progress')
  await advanceReloadTimer()
  expect(mocks.fetch).toHaveBeenCalledTimes(3)
  await act(async () => {
    third.resolve(textResult('current'))
  })
  await flush()
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('current')
  expect(hook.result.current.sections[0]?.added).toBe(3)
  expect(hook.result.current.generation).toBe(generation)
})

it('keeps a dirty draft when its status and rename metadata change', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = { status: entries(10), file, viewStateKey: 'dirty-metadata' }
  const hook = renderReview(review)
  await visitAll(hook, 10)
  act(() =>
    hook.result.current.setSections((prev) =>
      prev.map((section, index) =>
        index === 7
          ? { ...section, dirty: true, modifiedContent: 'unsaved draft', saveConflict: true }
          : section
      )
    )
  )
  const before = hook.result.current
  mocks.fetch.mockClear()
  hook.rerender({
    ...review,
    status: review.status.map((entry, index) =>
      index === 7
        ? {
            ...entry,
            status: 'renamed',
            oldPath: 'prior.ts',
            added: 2
          }
        : entry
    )
  })
  await visitAll(hook, 10)
  expect(mocks.fetch).not.toHaveBeenCalled()
  expect(hook.result.current.sections[7]).toMatchObject({
    dirty: true,
    modifiedContent: 'unsaved draft',
    saveConflict: true,
    status: 'renamed',
    oldPath: 'prior.ts',
    added: 2
  })
  expect(hook.result.current.sections[6]).toBe(before.sections[6])
  expect(hook.result.current.registry.loadedIndicesRef.current.has(7)).toBe(true)
})

it.each(['collapsed', 'offscreen'] as const)(
  'leaves a changed %s row stale until it can be viewed',
  async (eligibility) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mocks.fetch.mockResolvedValue(textResult())
    const review: Review = { status: entries(10), file, viewStateKey: eligibility }
    const hook = renderReview(review)
    await visitAll(hook, 10)
    if (eligibility === 'collapsed') {
      hook.result.current.registry.renderedIndicesRef.current.add(7)
      act(() =>
        hook.result.current.setSections((prev) =>
          prev.map((section, index) => (index === 7 ? { ...section, collapsed: true } : section))
        )
      )
    }
    const before = hook.result.current.sections[7]
    mocks.fetch.mockClear()
    hook.rerender({
      ...review,
      status: review.status.map((entry, index) => (index === 7 ? { ...entry, added: 2 } : entry))
    })
    await advanceReloadTimer()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(hook.result.current.sections[7]?.modifiedContent).toBe(before?.modifiedContent)
    expect(hook.result.current.registry.loadedIndicesRef.current.has(7)).toBe(false)
    expect(hook.result.current.registry.loadedIndicesRef.current.has(8)).toBe(true)
    act(() =>
      hook.result.current.setSections((prev) =>
        prev.map((section, index) => (index === 7 ? { ...section, collapsed: false } : section))
      )
    )
    act(() => {
      hook.result.current.registry.renderedIndicesRef.current.add(7)
      hook.result.current.loader.loadSection(7)
    })
    await flush()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(hook.result.current.registry.loadedIndicesRef.current.has(7)).toBe(true)
  }
)

it('revalidates both areas of the changed path while retaining unrelated loaded paths', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.fetch.mockResolvedValue(textResult())
  const initial = entries(10)
  const review: Review = {
    status: [...initial, { ...initial[7]!, area: 'staged' }],
    file,
    viewStateKey: 'two-areas'
  }
  const hook = renderReview(review)
  await visitAll(hook, 11)
  const before = hook.result.current
  hook.result.current.registry.renderedIndicesRef.current = new Set([7, 10])
  mocks.fetch.mockClear()
  hook.rerender({
    ...review,
    status: review.status.map((entry, index) => (index === 10 ? { ...entry, added: 2 } : entry))
  })
  await advanceReloadTimer()
  expect(mocks.fetch.mock.calls.map(([request]) => request.entry.area).sort()).toEqual([
    'staged',
    'unstaged'
  ])
  expect(hook.result.current.sections[6]).toBe(before.sections[6])
  expect(hook.result.current.sections[7]?.key).toBe('unstaged:file-7.ts')
  expect(hook.result.current.sections[10]?.key).toBe('staged:file-7.ts')
  expect(hook.result.current.generation).toBe(before.generation)
})

it.each([
  {
    name: 'path',
    change: (review: Review): Review => ({
      ...review,
      status: review.status.map((entry, index) =>
        index === 1 ? { ...entry, path: 'new.ts' } : entry
      )
    })
  },
  {
    name: 'area',
    change: (review: Review): Review => ({
      ...review,
      status: review.status.map((entry, index) =>
        index === 1 ? { ...entry, area: 'staged' } : entry
      )
    })
  },
  {
    name: 'order',
    change: (review: Review): Review => ({ ...review, status: review.status.toReversed() })
  },
  {
    name: 'count',
    change: (review: Review): Review => ({ ...review, status: review.status.slice(1) })
  },
  { name: 'view', change: (review: Review): Review => ({ ...review, viewStateKey: 'next-view' }) },
  {
    name: 'worktree owner',
    change: (review: Review): Review => ({
      ...review,
      file: { ...review.file, worktreeId: 'folder:other' }
    })
  },
  {
    name: 'runtime owner',
    change: (review: Review): Review => ({
      ...review,
      file: { ...review.file, runtimeEnvironmentId: 'remote' }
    })
  },
  {
    name: 'root path',
    change: (review: Review): Review => ({
      ...review,
      file: { ...review.file, filePath: '/folder' }
    })
  },
  {
    name: 'source',
    change: (review: Review): Review => ({
      ...review,
      file: { ...review.file, diffSource: 'combined-all' }
    })
  },
  {
    name: 'compare context',
    change: (review: Review): Review => ({
      ...review,
      file: {
        ...review.file,
        branchCompare: {
          baseRef: 'main',
          baseOid: 'base',
          headOid: 'head',
          mergeBase: 'merge',
          compareRef: 'topic',
          compareVersion: 'v2'
        }
      }
    })
  },
  {
    name: 'area filter',
    change: (review: Review): Review => ({
      ...review,
      file: { ...review.file, combinedAreaFilter: 'unstaged' }
    })
  }
])('uses the full reset when $name changes', async ({ name, change }) => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = { status: entries(3), file, viewStateKey: `fallback-${name}` }
  const hook = renderReview(review)
  await flush()
  act(() => hook.result.current.setSectionHeights({ 0: 200, 1: 200, 2: 200 }))
  const before = hook.result.current
  mocks.fetch.mockClear()
  const next = change(review)
  hook.rerender(next)
  await flush()
  expect(hook.result.current.generation).toBe(before.generation + 1)
  expect(hook.result.current.sectionHeights).toEqual({})
  expect(hook.result.current.sections[0]).not.toBe(before.sections[0])
  expect(mocks.fetch.mock.calls[0]?.[0].file.worktreeId).toBe(next.file.worktreeId)
  expect(mocks.fetch.mock.calls[0]?.[0].file.filePath).toBe(next.file.filePath)
  expect(mocks.fetch.mock.calls[0]?.[0].file.runtimeEnvironmentId).toBe(
    next.file.runtimeEnvironmentId
  )
})

it.each([
  { name: 'crosses above the line limit', before: 10_000, after: 10_001, deferred: true },
  { name: 'crosses below the line limit', before: 10_001, after: 10_000, deferred: false },
  { name: 'receives its first count', before: undefined, after: 1, deferred: false },
  { name: 'loses its last count', before: 1, after: undefined, deferred: true }
])('resets on-demand admission when a row $name', async ({ before, after, deferred }) => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = {
    status: [{ ...entries(1)[0]!, added: before }],
    file,
    viewStateKey: `policy-${before}-${after}`
  }
  const hook = renderReview(review)
  await flush()
  const generation = hook.result.current.generation
  hook.rerender({ ...review, status: [{ ...review.status[0]!, added: after }] })
  await flush()
  expect(hook.result.current.generation).toBe(generation + 1)
  expect(hook.result.current.sections[0]?.loadOnDemand).toBe(deferred)
  expect(hook.result.current.sections[0]?.loading).toBe(false)
})

it('recomputes unknown sibling policy within its own staging area', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const initial: GitStatusEntry[] = [
    { path: 'a.ts', area: 'unstaged', status: 'modified' },
    { path: 'b.ts', area: 'unstaged', status: 'modified' },
    { path: 'c.ts', area: 'staged', status: 'modified' }
  ]
  const review: Review = { status: initial, file, viewStateKey: 'counted-siblings' }
  const hook = renderReview(review)
  await flush()
  expect(hook.result.current.sections.map((section) => section.loadOnDemand)).toEqual([
    true,
    true,
    true
  ])
  const generation = hook.result.current.generation
  const counted = initial.map((entry, index) => (index === 0 ? { ...entry, added: 1 } : entry))
  hook.rerender({ ...review, status: counted })
  await flush()
  expect(hook.result.current.generation).toBe(generation + 1)
  expect(hook.result.current.sections.map((section) => section.loadOnDemand)).toEqual([
    false,
    false,
    true
  ])
  const unstagedSibling = hook.result.current.sections[1]
  hook.rerender({
    ...review,
    status: counted.map((entry, index) => (index === 0 ? { ...entry, added: 2 } : entry))
  })
  await flush()
  expect(hook.result.current.generation).toBe(generation + 1)
  expect(hook.result.current.sections[1]).toBe(unstagedSibling)
  expect(hook.result.current.sections[2]?.loadOnDemand).toBe(true)
})

it('recomputes the submodule exception even when the cache signature is unchanged', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = {
    status: [{ ...entries(1)[0]!, added: undefined }],
    file,
    viewStateKey: 'submodule-policy'
  }
  const hook = renderReview(review)
  await flush()
  const generation = hook.result.current.generation
  hook.rerender({
    ...review,
    status: [
      {
        ...review.status[0]!,
        submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
      }
    ]
  })
  await flush()
  expect(hook.result.current.generation).toBe(generation + 1)
  expect(hook.result.current.sections[0]?.loadOnDemand).toBe(false)
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('after\n')
})

it('keeps a queued, accepted deferred load through an unrelated metadata update', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.fetch.mockResolvedValue(textResult())
  const initial = entries(10).map((entry, index) =>
    index >= 8 ? { ...entry, added: 10_001 } : entry
  )
  const review: Review = { status: initial, file, viewStateKey: 'accepted-deferred' }
  const hook = renderReview(review)
  await visitAll(hook, 10)
  const pending = deferredResult()
  mocks.fetch
    .mockClear()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue(textResult('accepted'))
  hook.result.current.registry.renderedIndicesRef.current.add(7)
  act(() => hook.result.current.retry.requestSectionReload(7))
  await advanceReloadTimer()
  act(() => hook.result.current.loader.loadDeferredSection(8))
  await flush()
  expect(hook.result.current.registry.deferredLoadRequestsRef.current.has(8)).toBe(true)
  const before = hook.result.current
  hook.rerender({
    ...review,
    status: initial.map((entry, index) => (index === 9 ? { ...entry, added: 10_002 } : entry))
  })
  expect(hook.result.current.registry.deferredLoadRequestsRef.current.has(8)).toBe(true)
  expect(hook.result.current.generation).toBe(before.generation)
  expect(hook.result.current.sections[8]?.loadOnDemand).toBe(false)
  expect(hook.result.current.sections[9]?.loadOnDemand).toBe(true)
  await act(async () => {
    pending.resolve(textResult())
  })
  await flush()
  expect(mocks.fetch.mock.calls.map(([request]) => request.entry.path)).toEqual([
    'file-7.ts',
    'file-8.ts'
  ])
  expect(hook.result.current.sections[8]?.modifiedContent).toBe('accepted')
})

it('persists retained bodies and heights for reopen with the updated cache signature', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = { status: entries(10), file, viewStateKey: 'retained-reopen' }
  const hook = renderReview(review)
  await visitAll(hook, 10)
  act(() => hook.result.current.setSectionHeights({ 0: 200, 7: 300 }))
  const lease = hook.result.current.restore.memoryLeaseRef.current
  const anchor = { key: 'unstaged:file-7.ts', offset: 50 }
  rememberCombinedDiffView(lease, { scrollTop: 1200, scrollAnchor: anchor })
  const updated = {
    ...review,
    status: review.status.map((entry, index) => (index === 7 ? { ...entry, added: 2 } : entry))
  }
  hook.rerender(updated)
  await visitAll(hook, 10)
  const beforeClose = hook.result.current
  expect(beforeClose.restore.memoryLeaseRef.current).toBe(lease)
  hook.unmount()
  mocks.fetch.mockClear()
  const reopened = renderReview(updated)
  await flush()
  expect(mocks.fetch).not.toHaveBeenCalled()
  expect(reopened.result.current.sections).toBe(beforeClose.sections)
  expect(reopened.result.current.sectionHeights).toBe(beforeClose.sectionHeights)
  expect(reopened.result.current.registry.loadedIndicesRef.current.size).toBe(10)
  expect(reopened.result.current.restore.scrollOffsetRef.current).toBe(1200)
  expect(reopened.result.current.restore.scrollAnchorRef.current).toEqual(anchor)
})

it('invalidates an in-flight sibling in the other area of the changed path', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const pending = deferredResult()
  mocks.fetch.mockReturnValueOnce(pending.promise).mockResolvedValue(textResult('current'))
  const initial = entries(2)
  const review: Review = {
    status: [initial[0]!, { ...initial[0]!, area: 'staged' }, initial[1]!],
    file,
    viewStateKey: 'other-area-in-flight'
  }
  const hook = renderReview(review)
  await flush()
  hook.result.current.registry.renderedIndicesRef.current.add(0)
  const generation = hook.result.current.generation
  hook.rerender({
    ...review,
    status: review.status.map((entry, index) => (index === 1 ? { ...entry, added: 2 } : entry))
  })
  expect(hook.result.current.registry.sectionLoadTokensRef.current.get(0)).toBe(1)
  await act(async () => {
    pending.resolve(textResult('obsolete'))
  })
  await flush()
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('')
  await advanceReloadTimer()
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('current')
  expect(
    mocks.fetch.mock.calls.map(([request]) => [request.entry.path, request.entry.area])
  ).toEqual([
    ['file-0.ts', 'unstaged'],
    ['file-0.ts', 'staged'],
    ['file-1.ts', 'unstaged'],
    ['file-0.ts', 'unstaged']
  ])
  expect(hook.result.current.generation).toBe(generation)
})

it('retains an in-flight dirty draft and ignores its later disk result', async () => {
  const pending = deferredResult()
  mocks.fetch.mockReturnValueOnce(pending.promise)
  const review: Review = { status: entries(1), file, viewStateKey: 'in-flight-draft' }
  const hook = renderReview(review)
  await flush()
  act(() =>
    hook.result.current.setSections((prev) =>
      prev.map((section) => ({ ...section, dirty: true, loading: false, modifiedContent: 'draft' }))
    )
  )
  hook.rerender({ ...review, status: [{ ...review.status[0]!, added: 2 }] })
  await act(async () => {
    pending.resolve(textResult('disk'))
  })
  await flush()
  expect(hook.result.current.sections[0]).toMatchObject({
    dirty: true,
    modifiedContent: 'draft',
    added: 2
  })
  expect(hook.result.current.registry.loadedIndicesRef.current.has(0)).toBe(true)
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
})

it('keeps all row identities on an unchanged refresh with an unrelated hidden path', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = {
    status: entries(100),
    file: { ...file, combinedAreaFilter: 'unstaged' },
    viewStateKey: 'unchanged-refresh'
  }
  const hook = renderReview(review)
  await visitAll(hook, 100)
  const before = hook.result.current
  const reset = vi.spyOn(before.registry.loadSchedulerRef.current, 'reset')
  const request = vi.spyOn(before.registry.loadSchedulerRef.current, 'request')
  mocks.fetch.mockClear()
  hook.rerender({
    ...review,
    status: [
      ...review.status.map((entry) => ({ ...entry })),
      { path: 'hidden.ts', status: 'modified', area: 'staged', added: 1 }
    ]
  })
  await flush()
  expect(hook.result.current.sections).toBe(before.sections)
  expect(hook.result.current.generation).toBe(before.generation)
  expect(hook.result.current.registry.loadedIndicesRef.current.size).toBe(100)
  expect(reset).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('keeps snapshot-backed reviews on their captured metadata', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const initial = entries(10)
  const review: Review = {
    status: initial,
    file: { ...file, uncommittedEntriesSnapshot: initial },
    viewStateKey: 'snapshot-review'
  }
  const hook = renderReview(review)
  await visitAll(hook, 10)
  const before = hook.result.current
  mocks.fetch.mockClear()
  hook.rerender({
    ...review,
    status: initial.map((entry, index) => (index === 7 ? { ...entry, added: 2 } : entry))
  })
  await flush()
  expect(hook.result.current.sections).toBe(before.sections)
  expect(hook.result.current.sections[7]?.added).toBe(1)
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('preserves automatic admission for a binary extension with unknown counts', async () => {
  mocks.fetch.mockResolvedValue(textResult())
  const review: Review = {
    status: [{ ...entries(1)[0]!, path: 'image.png', added: undefined }],
    file,
    viewStateKey: 'binary-admission'
  }
  const hook = renderReview(review)
  await flush()
  expect(hook.result.current.sections[0]?.loadOnDemand).toBe(false)
  const generation = hook.result.current.generation
  hook.rerender({ ...review, status: [{ ...review.status[0]!, status: 'added' }] })
  await flush()
  expect(hook.result.current.generation).toBe(generation)
  expect(hook.result.current.sections[0]).toMatchObject({
    status: 'added',
    loadOnDemand: false,
    modifiedContent: 'after\n'
  })
})

it('restores a cached destination draft and height when the view and owner change together', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.fetch.mockResolvedValue(textResult())
  const destination: Review = {
    status: [{ ...entries(1)[0]!, path: 'destination.ts' }],
    file: {
      ...file,
      worktreeId: 'folder:destination',
      filePath: '/destination',
      runtimeEnvironmentId: 'remote-destination'
    },
    viewStateKey: 'cached-destination'
  }
  const seed = renderReview(destination)
  await flush()
  act(() => {
    seed.result.current.setSections((prev) =>
      prev.map((section) => ({ ...section, dirty: true, modifiedContent: 'destination draft' }))
    )
    seed.result.current.setSectionHeights({ 0: 420 })
  })
  const cachedSections = seed.result.current.sections
  const cachedHeights = seed.result.current.sectionHeights
  seed.unmount()
  const hook = renderReview({ status: entries(1), file, viewStateKey: 'source-view' })
  await flush()
  expect(hook.result.current.sections[0]?.modifiedContent).toBe('after\n')
  hook.result.current.registry.renderedIndicesRef.current.add(0)
  mocks.fetch.mockClear()
  hook.rerender(destination)
  await advanceReloadTimer()
  expect(mocks.fetch).not.toHaveBeenCalled()
  expect(hook.result.current.sections).toBe(cachedSections)
  expect(hook.result.current.sections[0]).toMatchObject({
    dirty: true,
    modifiedContent: 'destination draft'
  })
  expect(hook.result.current.sectionHeights).toBe(cachedHeights)
  expect(hook.result.current.registry.loadedIndicesRef.current.has(0)).toBe(true)
})
