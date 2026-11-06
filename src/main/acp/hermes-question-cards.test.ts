import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  closeProviderTimelineRigs,
  SESSION
} from '../native-chat/agent-session-timeline/provider-timeline-assembler-test-support'
import { readExternalAcpLaunchSpecs } from './external-acp-launch-specs'
import { GENERIC_ACP_DIALECT } from './acp-dialects/acp-dialect'
import { OPENCODE_ACP_DIALECT } from './acp-dialects/opencode-dialect'
import { OMP_ACP_DIALECT } from './acp-dialects/omp-dialect'
import { ANTIGRAVITY_ACP_DIALECT } from './acp-dialects/antigravity-dialect'
import {
  openAcpAdapterRig,
  GROK,
  PROVIDER_SESSION,
  sendHello,
  waitFor,
  type AcpAdapterRig
} from './acp-structured-adapter.test-support'

const roots: string[] = []
const rigs: AcpAdapterRig[] = []
afterEach(async () => {
  await Promise.all(
    rigs.splice(0).map((rig) => {
      rig.child().agent.on('session/cancel', () => {
        const prompt = rig.sent('session/prompt').at(-1)
        if (prompt) {
          rig.child().agent.reply(prompt, { stopReason: 'cancelled' })
        }
      })
      return rig.adapter.closeSession(SESSION)
    })
  )
  await closeProviderTimelineRigs()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function externalSpec(agent = 'hermes') {
  const root = mkdtempSync(join(tmpdir(), 'hermes-question-cards-'))
  roots.push(root)
  const path = join(root, 'agents.json')
  writeFileSync(
    path,
    JSON.stringify({ version: 1, agents: [{ agent, command: '/opt/acp', args: [] }] }),
    {
      mode: 0o600
    }
  )
  const result = readExternalAcpLaunchSpecs(path, [])
  if (!result.ok || !result.specs[0]) {
    throw new Error('test registration rejected')
  }
  return result.specs[0]
}

const question = {
  sessionId: PROVIDER_SESSION,
  toolCallId: 'ask-hermes-1',
  questions: [
    { question: 'Which?', options: [{ label: 'A', description: 'First' }, { label: 'B' }] }
  ]
}

async function openRig(spec = externalSpec(), fullAccess = false) {
  const rig = await openAcpAdapterRig({ spec, launch: { fullAccess } })
  rigs.push(rig)
  await rig.acquire()
  return rig
}

async function questionRow(rig: AcpAdapterRig) {
  return waitFor(async () => {
    const row = (await rig.rig.rows()).find((row) => row.body.kind === 'question')
    expect(row).toBeDefined()
    return row!
  })
}

it('receives a Hermes question over ACP and returns the existing label answer contract once', async () => {
  const rig = await openRig()
  await sendHello(rig, 'send-hermes-1')
  const prompt = await rig.frame('session/prompt')
  const { agent } = rig.child()
  agent.notify('session/update', {
    sessionId: PROVIDER_SESSION,
    update: {
      sessionUpdate: 'tool_call',
      toolCallId: question.toolCallId,
      title: 'Ask',
      kind: 'other'
    }
  })
  const reply = agent.request(101, '_orca/ask_user_question', question)
  const row = await questionRow(rig)
  const tool = (await rig.rig.rows()).find((row) => row.body.kind === 'tool-call')
  expect(row.turnScope).toMatchObject({ kind: 'turn' })
  expect(row.turnScope).toEqual(tool?.turnScope)
  expect(row.body).toMatchObject({
    question: 'Which?',
    questions: [
      {
        id: 'q1',
        options: [
          { id: 'o1', label: 'A', description: 'First' },
          { id: 'o2', label: 'B' }
        ]
      }
    ]
  })
  await rig.adapter.answerPrompt({
    sessionId: SESSION,
    itemId: row.itemId,
    kind: 'question',
    response: { kind: 'answers', answers: [{ questionId: 'q1', optionIds: ['o2'] }] },
    fence: 1,
    commit: async () => {}
  })
  expect(await reply).toEqual({
    jsonrpc: '2.0',
    id: 101,
    result: { outcome: 'accepted', answers: { 'Which?': 'B' } }
  })
  await expect(
    rig.adapter.answerPrompt({
      sessionId: SESSION,
      itemId: row.itemId,
      kind: 'question',
      response: { kind: 'option', optionId: 'o1' },
      fence: 1,
      commit: async () => {}
    })
  ).rejects.toThrow(/no longer waiting/)
  expect(agent.frames.filter((frame) => frame.id === 101 && !frame.method)).toHaveLength(1)
  agent.reply(prompt, { stopReason: 'end_turn' })
})

it('advertises question cards in the actual Hermes initialize request', async () => {
  const rig = await openRig()
  expect((await rig.frame('initialize')).params).toEqual({
    protocolVersion: 1,
    clientInfo: { name: 'orca', version: '1' },
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      _meta: { 'orca.questionCards': 1 }
    }
  })
})

it('keeps other capability metadata in the initialize transport', async () => {
  const spec = externalSpec()
  const rig = await openRig({
    ...spec,
    dialect: {
      ...spec.dialect,
      clientCapabilitiesMeta: { ...spec.dialect.clientCapabilitiesMeta, 'existing.extension': true }
    }
  })
  expect((await rig.frame('initialize')).params).toMatchObject({
    clientCapabilities: { _meta: { 'existing.extension': true, 'orca.questionCards': 1 } }
  })
})

it.each([
  ['team-agent', () => externalSpec('team-agent')],
  ['other-agent', () => externalSpec('other-agent')],
  ['Grok', () => GROK],
  ['generic', () => ({ ...GROK, dialect: GENERIC_ACP_DIALECT })],
  ['OpenCode', () => ({ ...GROK, dialect: OPENCODE_ACP_DIALECT })],
  ['OMP', () => ({ ...GROK, dialect: OMP_ACP_DIALECT })],
  ['Antigravity', () => ({ ...GROK, dialect: ANTIGRAVITY_ACP_DIALECT })]
] as const)('does not expose Hermes questions or capabilities through %s', async (_name, spec) => {
  const launch = spec()
  const rig = await openRig(launch)
  await sendHello(rig, 'send-isolation')
  await rig.frame('session/prompt')
  // Other dialects keep their own upstream capabilities (OMP advertises elicitation), never the Hermes meta.
  expect((await rig.frame('initialize')).params).toEqual({
    protocolVersion: 1,
    clientInfo: { name: 'orca', version: '1' },
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      ...launch.dialect.clientCapabilities
    }
  })
  expect(await rig.child().agent.request(102, '_orca/ask_user_question', question)).toMatchObject({
    error: { code: -32601 }
  })
  expect((await rig.rig.rows()).some((row) => row.body.kind === 'question')).toBe(false)
})

it.each([
  'orca/ask_user_question',
  '_x.ai/ask_user_question',
  'x.ai/ask_user_question',
  '_x.ai/exit_plan_mode'
])('does not expose %s through Hermes', async (method) => {
  const rig = await openRig()
  await sendHello(rig, 'send-method')
  await rig.frame('session/prompt')
  expect(await rig.child().agent.request(103, method, question)).toMatchObject({
    error: { code: -32601 }
  })
  expect((await rig.rig.rows()).some((row) => row.body.kind === 'question')).toBe(false)
})

it.each([
  { ...question, sessionId: 'another-session' },
  { ...question, sessionId: undefined },
  { ...question, toolCallId: undefined },
  { ...question, questions: [] },
  { ...question, questions: [{ question: 'Which?', options: 'A' }] },
  { ...question, questions: [{ question: 'Which?', options: [{ label: 1 }] }] }
])('rejects an invalid Hermes request without opening a card: %j', async (params) => {
  const rig = await openRig()
  await sendHello(rig, 'send-invalid')
  await rig.frame('session/prompt')
  expect(await rig.child().agent.request(104, '_orca/ask_user_question', params)).toMatchObject({
    error: { code: -32602 }
  })
  expect((await rig.rig.rows()).some((row) => row.body.kind === 'question')).toBe(false)
})

it('validates grouped answers and keeps full-access questions interactive and session-isolated', async () => {
  const rig = await openRig(externalSpec(), true)
  await sendHello(rig, 'send-answers')
  const prompt = await rig.frame('session/prompt')
  const { agent } = rig.child()
  const reply = agent.request(105, '_orca/ask_user_question', {
    ...question,
    questions: [
      question.questions[0],
      {
        question: 'Tests?',
        multiSelect: true,
        options: [{ label: 'Unit' }, { label: 'Integration' }]
      },
      { question: 'Notes?', options: [] }
    ]
  })
  const row = await questionRow(rig)
  const input = {
    sessionId: SESSION,
    itemId: row.itemId,
    kind: 'question' as const,
    fence: 1,
    commit: async () => {}
  }
  for (const answers of [
    [],
    [
      { questionId: 'q1', optionIds: ['missing'] },
      { questionId: 'q2', optionIds: ['o1'] },
      { questionId: 'q3', optionIds: [], other: 'Notes' }
    ],
    [
      { questionId: 'q1', optionIds: ['o1', 'o2'] },
      { questionId: 'q2', optionIds: ['o1'] },
      { questionId: 'q3', optionIds: [], other: 'Notes' }
    ]
  ]) {
    await expect(
      rig.adapter.answerPrompt({ ...input, response: { kind: 'answers', answers } })
    ).rejects.toThrow(/every offered question/)
  }
  await expect(async () =>
    rig.adapter.answerPrompt({
      ...input,
      sessionId: 'another-session',
      response: { kind: 'option', optionId: 'o1' }
    })
  ).rejects.toThrow(/no live/)
  await expect(
    rig.adapter.answerPrompt({
      ...input,
      itemId: 'another-card',
      response: { kind: 'option', optionId: 'o1' }
    })
  ).rejects.toThrow(/no longer waiting/)
  expect(agent.frames.filter((frame) => frame.id === 105 && !frame.method)).toHaveLength(0)
  expect((await questionRow(rig)).body).toMatchObject({ resolution: { state: 'pending' } })
  await rig.adapter.answerPrompt({
    ...input,
    response: {
      kind: 'answers',
      answers: [
        { questionId: 'q1', optionIds: ['o1'], other: ' Also smoke ' },
        { questionId: 'q2', optionIds: ['o1', 'o2'] },
        { questionId: 'q3', optionIds: [], other: ' Custom ' }
      ]
    }
  })
  expect(await reply).toMatchObject({
    result: {
      outcome: 'accepted',
      answers: { 'Which?': 'A', 'Tests?': ['Unit', 'Integration'], 'Notes?': 'Other' },
      annotations: { 'Which?': { notes: 'Also smoke' }, 'Notes?': { notes: 'Custom' } }
    }
  })
  agent.reply(prompt, { stopReason: 'end_turn' })
})

it('accepts the existing legacy option answer for a single Hermes question', async () => {
  const rig = await openRig()
  await sendHello(rig, 'send-legacy')
  const prompt = await rig.frame('session/prompt')
  const { agent } = rig.child()
  const reply = agent.request(106, '_orca/ask_user_question', question)
  const row = await questionRow(rig)
  await rig.adapter.answerPrompt({
    sessionId: SESSION,
    itemId: row.itemId,
    kind: 'question',
    fence: 1,
    response: { kind: 'option', optionId: 'o1' },
    commit: async () => {}
  })
  expect(await reply).toMatchObject({ result: { outcome: 'accepted', answers: { 'Which?': 'A' } } })
  agent.reply(prompt, { stopReason: 'end_turn' })
})

it.each(['stop', 'close'] as const)('withdraws Hermes questions on %s', async (ending) => {
  const rig = await openRig()
  await sendHello(rig, 'send-cancel')
  const prompt = await rig.frame('session/prompt')
  const { agent } = rig.child()
  const reply = agent.request(107, '_orca/ask_user_question', question)
  const row = await questionRow(rig)
  agent.on('session/cancel', () => agent.reply(prompt, { stopReason: 'cancelled' }))
  await (ending === 'stop'
    ? rig.adapter.cancelTurn({ sessionId: SESSION, fence: 1 })
    : rig.adapter.closeSession(SESSION))
  expect(await reply).toMatchObject({ result: { outcome: 'cancelled' } })
  await waitFor(async () => {
    expect((await questionRow(rig)).body).toMatchObject({ resolution: { state: 'cancelled' } })
  })
  expect(agent.frames.filter((frame) => frame.id === 107 && !frame.method)).toHaveLength(1)
  await expect(async () =>
    rig.adapter.answerPrompt({
      sessionId: SESSION,
      itemId: row.itemId,
      kind: 'question',
      fence: 1,
      response: { kind: 'option', optionId: 'o1' },
      commit: async () => {}
    })
  ).rejects.toThrow(/no longer waiting|no live/)
})

it.each(['Hermes', 'Grok'] as const)(
  'keeps the existing turn-end lifecycle for %s questions',
  async (name) => {
    const rig = await openRig(name === 'Hermes' ? externalSpec() : GROK)
    const method = name === 'Hermes' ? '_orca/ask_user_question' : '_x.ai/ask_user_question'
    await sendHello(rig, 'send-end')
    const prompt = await rig.frame('session/prompt')
    const { agent } = rig.child()
    agent.notify('session/update', {
      sessionId: PROVIDER_SESSION,
      _meta: { promptId: 'prompt:send-end' },
      update: { sessionUpdate: 'tool_call', toolCallId: question.toolCallId, title: 'Ask' }
    })
    void agent.request(109, method, question)
    await questionRow(rig)
    agent.reply(prompt, { stopReason: 'end_turn' })
    // A live question outlives its turn (upstream #38488): only an answer, the agent's withdrawal,
    // Stop, a steer or the session ending settles it.
    await rig.frame('session/prompt').catch(() => undefined)
    expect((await questionRow(rig)).body).toMatchObject({ resolution: { state: 'pending' } })
    expect(agent.frames.filter((frame) => frame.id === 109 && !frame.method)).toHaveLength(0)
    expect((await rig.rig.rows()).filter((row) => row.body.kind === 'question')).toHaveLength(1)
    // Ending the session tears the agent down without answering the pending request.
    await rig.adapter.closeSession(SESSION)
    expect(agent.frames.filter((frame) => frame.id === 109 && !frame.method)).toHaveLength(0)
  }
)

it('shows a Hermes question outside a live prompt as a card that waits, like other agents', async () => {
  const rig = await openRig()
  const { agent } = rig.child()
  void agent.request(108, '_orca/ask_user_question', question)
  const row = await questionRow(rig)
  expect(row.body).toMatchObject({ resolution: { state: 'pending' } })
  await rig.adapter.answerPrompt({
    sessionId: SESSION,
    itemId: row.itemId,
    kind: 'question',
    response: { kind: 'answers', answers: [{ questionId: 'q1', optionIds: ['o1'] }] },
    fence: 1,
    commit: async () => {}
  })
  await waitFor(() => {
    expect(agent.frames.filter((frame) => frame.id === 108 && !frame.method)).toHaveLength(1)
  })
  expect(agent.frames.find((frame) => frame.id === 108 && !frame.method)).toMatchObject({
    result: { outcome: 'accepted', answers: { 'Which?': 'A' } }
  })
})

it.each([false, true])(
  'settles a claimed Hermes answer once when Stop races its commit (failure=%s)',
  async (commitFails) => {
    const rig = await openRig()
    await sendHello(rig, 'send-commit')
    const prompt = await rig.frame('session/prompt')
    const { agent } = rig.child()
    const reply = agent.request(111, '_orca/ask_user_question', question)
    const row = await questionRow(rig)
    agent.on('session/cancel', () => agent.reply(prompt, { stopReason: 'cancelled' }))
    const answer = rig.adapter.answerPrompt({
      sessionId: SESSION,
      itemId: row.itemId,
      kind: 'question',
      fence: 1,
      response: { kind: 'option', optionId: 'o1' },
      commit: async () => {
        await rig.adapter.cancelTurn({ sessionId: SESSION, fence: 1 })
        expect(agent.frames.filter((frame) => frame.id === 111 && !frame.method)).toHaveLength(0)
        if (commitFails) {
          throw new Error('test commit refused')
        }
      }
    })
    await (commitFails ? expect(answer).rejects.toThrow('test commit refused') : answer)
    expect(await reply).toMatchObject({
      result: commitFails
        ? { outcome: 'cancelled' }
        : { outcome: 'accepted', answers: { 'Which?': 'A' } }
    })
    expect(agent.frames.filter((frame) => frame.id === 111 && !frame.method)).toHaveLength(1)
  }
)
