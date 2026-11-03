import { nativeChatPaneHeader } from './NativeChatPaneHeader'
import { HostRowIcon } from '@/components/host-row-icon'
import { translate } from '@/i18n/i18n'
import { getKnownExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { selectWorktreeHostDisplayLabel } from '@/lib/execution-host-display-label'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { getRepoIdFromWorktreeId } from '@/store/slices/worktree-helpers'
import { isUnresolvedOwnerHostId } from '../../../../shared/execution-host'

export function NativeChatRepositoryHeader({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element {
  const hostId = useAppStore((state) => getKnownExecutionHostIdForWorktree(state, worktreeId))
  const hostLabel = useAppStore((state) => selectWorktreeHostDisplayLabel(state, worktreeId))
  const repo = useRepoById(getRepoIdFromWorktreeId(worktreeId))
  const known = hostId !== null && !isUnresolvedOwnerHostId(hostId)
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs text-chat-foreground-faint"
      aria-label={translate('repositoryHost.repository', 'Repository')}
    >
      {known ? <HostRowIcon hostId={hostId} className="size-3.5 shrink-0" /> : null}
      <span className="truncate">
        {repo?.displayName ?? translate('repositoryHost.repository', 'Repository')}
      </span>
      <span className="truncate">
        {known
          ? `${hostId === 'local' ? translate('repositoryHost.local', 'Local') : translate('repositoryHost.remote', 'Remote')} · ${hostLabel}`
          : translate('repositoryHost.unknown', 'Repository host unknown')}
      </span>
    </div>
  )
}

export function nativeChatRepositoryPaneHeader(
  ...args: Parameters<typeof nativeChatPaneHeader>
): React.JSX.Element {
  const worktreeId = args[1]
  return (
    <>
      {nativeChatPaneHeader(...args)}
      {worktreeId ? <NativeChatRepositoryHeader worktreeId={worktreeId} /> : null}
    </>
  )
}
