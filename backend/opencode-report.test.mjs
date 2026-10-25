import test from 'node:test'
import assert from 'node:assert/strict'
import { reportInvocation } from './opencode-report.mjs'

test('OpenRouter usa el selector gratuito también para tareas auxiliares sin incrustar la clave', () => {
  const result = reportInvocation({ OPENCODE_MODEL: 'openrouter/openrouter/free', OPENROUTER_API_KEY: 'test-secret' })
  const config = JSON.parse(result.env.OPENCODE_CONFIG_CONTENT)
  assert.equal(config.small_model, 'openrouter/openrouter/free')
  assert.equal(config.provider.openrouter.options.apiKey, '{env:OPENROUTER_API_KEY}')
  assert.ok(config.provider.openrouter.models['openrouter/free'])
  assert.ok(!result.env.OPENCODE_CONFIG_CONTENT.includes('test-secret'))
  assert.ok(!result.args.includes('test-secret'))
})

test('usa agente sin herramientas y no pasa el corpus por argumentos ni archivo', () => {
  const input = { OPENCODE_MODEL: 'provider/model', OPENCODE_CONFIG_CONTENT: '{"agent":{"existing":{"mode":"primary"}}}' }
  const result = reportInvocation(input)
  const config = JSON.parse(result.env.OPENCODE_CONFIG_CONTENT)
  assert.deepEqual(config.agent['bibliographic-report'].permission, { '*': 'deny' })
  assert.equal(config.agent.existing.mode, 'primary')
  assert.ok(result.args.includes('bibliographic-report'))
  assert.ok(result.args.includes('provider/model'))
  assert.ok(!result.args.includes('--file'))
  assert.ok(!result.args.includes('--auto'))
  assert.equal(input.OPENCODE_CONFIG_CONTENT, '{"agent":{"existing":{"mode":"primary"}}}')
})
