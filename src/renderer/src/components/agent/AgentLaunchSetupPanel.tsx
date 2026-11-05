import { AgentLaunchSetupModelList } from './AgentLaunchSetupModelList'
import { textActionArgumentsOwnModel } from '../../../../shared/agent-launch/picker/agent-launch-picker-text-action'
import type { AgentLaunchSetupPanelProps } from './AgentLaunchSetupButton'
import {
  agentLaunchSetupOptionRows,
  agentLaunchSetupCatalogState as catalogState
} from './agent-launch-setup-option-rows'
import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getAgentSessionOptionLaunchCatalog } from '../../../../shared/agent-session/options/agent-session-option-catalog'
import { translate } from '@/i18n/i18n'
import { agentModelChoiceChips } from './launch-settings/agent-model-choice-chips'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { AgentDefaultArgsInput } from './launch-settings/AgentLaunchDefaultsEditor'
import { NativeChatSessionOptionRows } from '../native-chat/NativeChatSessionOptionRows'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'
import { AgentPermissionMenu } from './launch-settings/AgentPermissionChoiceControls'
import {
  AgentLaunchSetupFooter,
  agentLaunchSetupArgumentsNote,
  type AgentLaunchSetupFooterHandle
} from './AgentLaunchSetupFooter'
import { AgentLaunchSetupActions } from './AgentLaunchSetupActions'
import { agentPickerPanelArguments } from '../../../../shared/agent-launch/picker/agent-launch-picker-arguments'
import {
  acceptAgentPickerArguments,
  applyAgentPickerEdit,
  type AgentPickerEdit
} from '../../../../shared/agent-launch/picker/agent-launch-picker-edits'
import { agentPickerArgumentsKnown } from '../../../../shared/agent-launch/picker/agent-launch-picker-authority'
import { agentPickerEffectiveChoices } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import type { AgentPickerSurface } from '../../../../shared/agent-launch/picker/agent-launch-picker'
import {
  agentPickerModels,
  agentPickerEntryOptions,
  agentPickerPermissions
} from '../../../../shared/agent-launch/picker/agent-launch-picker-catalog'

export function AgentLaunchSetupPanel({
  entry,
  draft,
  getDraft,
  mode = 'launch',
  disabled,
  onDraftChange,
  onUse
}: AgentLaunchSetupPanelProps) {
  const footer = useRef<AgentLaunchSetupFooterHandle>(null)
  const editDraft = (edit: AgentPickerEdit) => {
    const current = getDraft()
    if (current) {
      onDraftChange(applyAgentPickerEdit(entry, current, edit))
    }
  }
  const [argumentsOpen, setArgumentsOpen] = useState(entry.defaultSurface === 'terminal')
  const argumentsKnown = agentPickerArgumentsKnown(entry, draft)
  const effective = agentPickerEffectiveChoices(entry, draft)
  const argumentsView = agentPickerPanelArguments(entry, draft)
  const models = agentPickerModels(entry)
  // Hermes picks its own model; offering Orca's list would only suggest a choice it ignores.
  const showsModelOptions = entry.agent !== 'hermes'
  const defaultsPending =
    draft.surface === 'chat' ? entry.structuredDefaultsPending : entry.defaultsPending
  const seed = getAgentSessionOptionLaunchCatalog(entry.agent)
  const listedDefaultKnown =
    entry.catalog.origin !== 'unknown' &&
    (entry.catalog.listingNamesConfiguredModel ?? seed?.hostListingNamesConfiguredModel === true)
  const currentModel =
    argumentsView.choices.model ??
    effective.model ??
    (!draft.delegated?.includes('model') && !defaultsPending && listedDefaultKnown
      ? models.find((model) => model.isDefault)?.id
      : undefined)
  // Settled with nothing chosen still lets the user pick; nothing is checked and the agent keeps its own default.
  const { hasModels, catalogPending, catalogMessage } = catalogState(entry, models, currentModel)
  const modelInArguments = textActionArgumentsOwnModel(entry, draft)
  const modelDisabled = disabled || defaultsPending || catalogPending
  const options = showsModelOptions
    ? agentPickerEntryOptions(entry, currentModel, draft.surface)
    : []
  const optionRows = agentLaunchSetupOptionRows({
    options,
    models,
    entry,
    draft,
    currentModel,
    argumentsView,
    defaultsPending,
    disabled,
    argumentsKnown
  })
  const renderOptions = (rows: SessionOptionDescriptor[]) =>
    rows.length ? (
      <NativeChatSessionOptionRows
        options={rows}
        shownReason={null}
        pendingIds={new Set()}
        divided={false}
        layout="settings"
        onSet={(option, value) => {
          if (entry.textGeneration && value === 'arguments') {
            return
          }
          editDraft(
            option.id === 'fastMode' || option.id === 'serviceTier'
              ? { kind: 'speed', key: option.id, value: String(value), model: currentModel }
              : { kind: 'choice', patch: { options: { [option.id]: String(value) } } }
          )
        }}
        onAction={() => {}}
      />
    ) : null
  const handleUse = (surface: AgentPickerSurface) => {
    const current = getDraft()
    if (current) {
      return onUse({ ...acceptAgentPickerArguments(entry, current), surface })
    }
    return false
  }
  const use = (surface: AgentPickerSurface) =>
    mode === 'select' ? handleUse(surface) : footer.current?.launch(surface)
  const choiceChips = agentModelChoiceChips(
    entry.agent,
    entry.label,
    argumentsView.choices,
    (patch) => {
      const key =
        patch.model !== undefined
          ? 'model'
          : patch.permissionMode !== undefined
            ? 'permissionMode'
            : Object.keys(patch.options ?? {})[0]
      editDraft({ kind: 'remove-chip', key })
      return agentPickerPanelArguments(entry, getDraft() ?? draft).text
    },
    argumentsView.context
  )
  const note = agentLaunchSetupArgumentsNote(entry.label, options, !seed?.modelApply.cli?.length)
  return (
    <div
      className="flex w-full flex-col"
      onKeyDownCapture={(event) => {
        if (isScreenSubmitShortcut(event)) {
          event.preventDefault()
          event.stopPropagation()
          const primary = mode === 'select' ? draft.surface : entry.defaultSurface
          const alternate = entry.surfaces.find((surface) => surface !== primary)
          if (alternate && !disabled && !event.repeat) {
            use(alternate)
          }
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (
          !disabled &&
          !isImeOwnedKeyboardEvent(event) &&
          event.key === 'Enter' &&
          (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        ) {
          event.preventDefault()
          use(mode === 'select' ? draft.surface : entry.defaultSurface)
        }
      }}
    >
      {showsModelOptions ? (
        <AgentLaunchSetupModelList
          entry={entry}
          draft={draft}
          mode={mode}
          disabled={disabled}
          models={models}
          currentModel={currentModel}
          modelDisabled={modelDisabled}
          catalogPending={catalogPending}
          catalogMessage={catalogMessage}
          hasModels={hasModels}
          modelInArguments={modelInArguments}
          editDraft={editDraft}
          use={use}
        />
      ) : null}
      <div className="grid min-w-0 grid-cols-1 gap-2.5 border-t border-border px-3 pt-2.5 pb-1">
        {renderOptions(
          optionRows.filter((row) => row.id !== 'fastMode' && row.id !== 'serviceTier')
        )}
        {!entry.textGeneration ? (
          <div>
            <AgentPermissionMenu
              agentId={entry.agent}
              label={entry.label}
              layout="row"
              showInherited={false}
              rawValue={argumentsView.selectedPermission ? undefined : argumentsView.permission}
              disabled={
                disabled ||
                defaultsPending ||
                !argumentsView.permission ||
                (entry.surfaces.includes('terminal') && !argumentsKnown)
              }
              permission={{
                choice: argumentsView.selectedPermission ?? 'own',
                defaultChoice: argumentsView.selectedPermission ?? 'own',
                choices: agentPickerPermissions(entry.agent, draft.surface),
                source: 'agent',
                flag: '',
                argsSetPermission: false,
                onSelect: (choice) => {
                  if (choice !== 'default') {
                    editDraft({ kind: 'permission', value: choice })
                  }
                }
              }}
            />
          </div>
        ) : null}
        {renderOptions(
          optionRows.filter((row) => row.id === 'fastMode' || row.id === 'serviceTier')
        )}
        {!entry.textGeneration && entry.surfaces.includes('terminal') ? (
          <div>
            <Collapsible open={argumentsOpen} onOpenChange={setArgumentsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={translate('agentPicker.toggleArguments', 'Toggle Arguments')}
                  className="flex min-h-7 w-full items-center gap-1.5 text-left text-xs"
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
                    {argumentsOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {translate('agentPicker.arguments', 'Arguments')}
                  </span>
                  <span className="ml-auto truncate text-muted-foreground/70">
                    {translate(
                      'agentPicker.argumentsTerminalHint',
                      'Only applies to terminal (CLI) launches'
                    )}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pb-1">
                  <AgentDefaultArgsInput
                    hideLabel
                    defaultArgs={argumentsView.text}
                    argsOverride={argumentsView.text}
                    disabled={disabled || !argumentsKnown}
                    note={note}
                    onDraftChange={(text) =>
                      editDraft({ kind: 'arguments', text, model: currentModel })
                    }
                    choiceChips={choiceChips}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
      </div>
      {mode === 'select' ? (
        <AgentLaunchSetupActions
          entry={entry}
          disabled={disabled}
          surface={draft.surface}
          onUse={(surface) => {
            void handleUse(surface)
          }}
        />
      ) : (
        <AgentLaunchSetupFooter
          ref={footer}
          entry={entry}
          disabled={disabled}
          onLaunch={(surface, prompt) => {
            const current = getDraft()
            return current
              ? onUse({
                  ...acceptAgentPickerArguments(entry, current),
                  surface,
                  ...(prompt ? { prompt } : {})
                })
              : false
          }}
        />
      )}
    </div>
  )
}
