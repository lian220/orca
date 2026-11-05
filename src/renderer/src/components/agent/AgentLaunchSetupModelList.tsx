import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem
} from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { AgentLaunchTextModelDefault } from './AgentLaunchTextModelDefault'
import type { AgentLaunchSetupPanelProps } from './AgentLaunchSetupButton'
import type { AgentPickerEdit } from '../../../../shared/agent-launch/picker/agent-launch-picker-edits'
import type {
  AgentPickerModel,
  AgentPickerSurface
} from '../../../../shared/agent-launch/picker/agent-launch-picker'

type AgentLaunchSetupModelListProps = Pick<
  AgentLaunchSetupPanelProps,
  'entry' | 'draft' | 'mode' | 'disabled'
> & {
  models: readonly AgentPickerModel[]
  currentModel: string | undefined
  modelDisabled: boolean
  catalogPending: boolean
  catalogMessage: string | null
  hasModels: boolean
  modelInArguments: boolean
  editDraft: (edit: AgentPickerEdit) => void
  use: (surface: AgentPickerSurface) => unknown
}

/** The searchable model list of the setup panel; Enter on the current row launches the panel's surface. */
export function AgentLaunchSetupModelList({
  entry,
  draft,
  mode,
  disabled,
  models,
  currentModel,
  modelDisabled,
  catalogPending,
  catalogMessage,
  hasModels,
  modelInArguments,
  editDraft,
  use
}: AgentLaunchSetupModelListProps) {
  const [modelQuery, setModelQuery] = useState('')
  const [legacy, setLegacy] = useState(false)
  const legacyCount = models.filter((model) => model.isLegacy && !model.hidden).length
  return (
    <Command
      surface="inline"
      density="model"
      onKeyDownCapture={(event) => {
        if (
          !disabled &&
          !isImeOwnedKeyboardEvent(event) &&
          event.key === 'Enter' &&
          event.currentTarget.querySelector(
            '[cmdk-item][data-selected="true"][data-current="true"]'
          )
        ) {
          event.preventDefault()
          event.stopPropagation()
          use(mode === 'select' ? draft.surface : entry.defaultSurface)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.stopPropagation()
        }
      }}
    >
      <CommandInput
        autoFocus
        disabled={modelDisabled}
        aria-busy={catalogPending}
        value={modelQuery}
        onValueChange={setModelQuery}
        aria-label={translate('agentPicker.searchModels', 'Search models')}
        placeholder={translate('agentPicker.searchAgentModels', 'Search {{agent}} models…', {
          agent: entry.label
        })}
      />
      <CommandList className="max-h-56" data-focus-behavior="page">
        {catalogMessage ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground" role="status">
            {catalogMessage}
          </div>
        ) : null}
        {hasModels &&
        modelQuery &&
        entry.catalog.origin !== 'unknown' &&
        !entry.catalog.listingInProgress &&
        entry.catalogRead !== 'pending' &&
        entry.catalogRead !== 'failed' &&
        entry.catalogRead !== 'unsupported' ? (
          <CommandEmpty>
            {translate('agentPicker.noModels', 'No models match your search.')}
          </CommandEmpty>
        ) : null}
        <CommandGroup>
          <AgentLaunchTextModelDefault
            entry={entry}
            disabled={modelDisabled}
            modelInArguments={modelInArguments}
            onSelect={editDraft}
          />
          {legacy && !modelQuery ? (
            <CommandItem value="__back__" disabled={disabled} onSelect={() => setLegacy(false)}>
              <ChevronLeft className="size-3.5 text-muted-foreground" />
              {translate('agentPicker.legacyModels', 'Legacy models')}
            </CommandItem>
          ) : null}
          {models
            .filter(
              (model) =>
                !model.hidden &&
                (model.id === currentModel || modelQuery || Boolean(model.isLegacy) === legacy)
            )
            .map((model) => (
              <CommandItem
                key={model.id}
                value={model.id}
                keywords={[model.label]}
                disabled={modelDisabled}
                data-current={currentModel === model.id && !modelInArguments}
                onSelect={() => editDraft({ kind: 'choice', patch: { model: model.id } })}
              >
                {model.label}
                <span className="ml-auto flex size-3.5 shrink-0 items-center justify-center">
                  {currentModel === model.id && !modelInArguments ? (
                    <Check className="size-3.5 text-muted-foreground" />
                  ) : null}
                </span>
              </CommandItem>
            ))}
          {!legacy && !modelQuery && legacyCount > 0 ? (
            <CommandItem value="__legacy__" disabled={disabled} onSelect={() => setLegacy(true)}>
              <span className="flex min-w-0 flex-col">
                <span>{translate('agentPicker.legacyModels', 'Legacy models')}</span>
                <span className="text-muted-foreground">
                  {translate('agentPicker.legacyModelCount', '{{total}} models', {
                    total: legacyCount
                  })}
                </span>
              </span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
            </CommandItem>
          ) : null}
          {currentModel && !models.some((model) => model.id === currentModel) ? (
            <CommandItem
              value={currentModel}
              disabled={modelDisabled}
              onSelect={() => {}}
              data-current="true"
            >
              {currentModel}
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
