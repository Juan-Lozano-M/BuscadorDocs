import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReportJson, requestReport } from './openrouter-report.mjs'

const draft = { alcance: 'Alcance', definicion: 'Definición', conceptosInterpretacion: 'Conceptos', nota: 'Nota', hallazgosPrincipales: [], oportunidades: [], limitaciones: [], conclusiones: [], ejemploR: { descripcion: 'Ejemplo', codigo: 'if (TRUE) { print("R") }\n' } }
const completion = (content, finish_reason = 'stop') => ({ ok: true, status: 200, json: async () => ({ model: 'modelo:free', choices: [{ message: { content, reasoning: 'no debe usarse' }, finish_reason }] }) })

test('extrae el objeto sin confundir llaves del código ni texto posterior', () => {
  assert.deepEqual(parseReportJson('\`\`\`json\n' + JSON.stringify(draft) + '\n\`\`\`\nTexto posterior {otro}'), draft)
})
test('rechaza JSON cortado y sintaxis inválida', () => {
  assert.throws(() => parseReportJson('{"definicion":"cortada'))
  assert.throws(() => parseReportJson('{"x": string}'))
})
test('reintenta contenido vacío y acepta bloques de texto finales', async () => {
  const requests = []
  const result = await requestReport('corpus', { apiKey: 'test', fetchImpl: async (_, options) => {
    requests.push(JSON.parse(options.body))
    return requests.length === 1 ? completion(null) : completion([{ type: 'text', text: JSON.stringify(draft) }])
  } })
  assert.deepEqual(result.draft, draft)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].response_format.type, 'json_schema')
  assert.equal(requests[0].response_format.json_schema.strict, true)
  assert.equal(requests[0].reasoning.enabled, false)
})
test('no acepta truncamiento ni publica razonamiento como informe', async () => {
  let calls = 0
  await assert.rejects(requestReport('corpus', { apiKey: 'test', fetchImpl: async () => {
    calls++
    return completion(JSON.stringify(draft), 'length')
  } }), /dos intentos.*límite/)
  assert.equal(calls, 2)
  await assert.rejects(requestReport('corpus', { apiKey: 'test', fetchImpl: async () => completion(null) }), /no entregó texto final/)
})
test('informe incompleto se reintenta; credenciales inválidas no', async () => {
  let calls = 0
  const result = await requestReport('corpus', { apiKey: 'test', fetchImpl: async () => completion(JSON.stringify(++calls === 1 ? { definicion: 'sola' } : draft)) })
  assert.deepEqual(result.draft, draft)
  calls = 0
  await assert.rejects(requestReport('corpus', { apiKey: 'test', fetchImpl: async () => {
    calls++
    return { ok: false, status: 401, json: async () => ({ error: { message: 'credencial inválida' } }) }
  } }), /401/)
  assert.equal(calls, 1)
})
test('respeta cancelaciones y no llama modelos de pago', async () => {
  const fetchImpl = async () => { assert.fail('No debe llamar al proveedor') }
  await assert.rejects(requestReport('corpus', { apiKey: 'test', signal: AbortSignal.abort(), fetchImpl }), { name: 'AbortError' })
  await assert.rejects(requestReport('corpus', { apiKey: 'test', model: 'modelo:paid', fetchImpl }), /gratuito/)
})

test('cambia a otro modelo gratuito ante saturación del proveedor', async () => {
  const models = []
  const result = await requestReport('corpus', { apiKey: 'test', fetchImpl: async (_, options) => {
    models.push(JSON.parse(options.body).model)
    return models.length === 1
      ? { ok: false, status: 429, json: async () => ({ error: { message: 'Proveedor saturado' } }) }
      : completion(JSON.stringify(draft))
  } })
  assert.deepEqual(result.draft, draft)
  assert.equal(models.length, 2)
  assert.notEqual(models[0], models[1])
  assert.ok(models.every(model => model === 'openrouter/free' || model.endsWith(':free')))
})

test('reintenta con otro modelo gratuito cuando OpenRouter devuelve 404 del proveedor', async () => {
  const models = []
  const result = await requestReport('corpus', { apiKey: 'test', fetchImpl: async (_, options) => {
    models.push(JSON.parse(options.body).model)
    return models.length === 1
      ? { ok: false, status: 404, json: async () => ({ error: { message: 'Provider returned error' } }) }
      : completion(JSON.stringify(draft))
  } })
  assert.deepEqual(result.draft, draft)
  assert.equal(models.length, 2)
  assert.notEqual(models[0], models[1])
  assert.ok(models.every(model => model === 'openrouter/free' || model.endsWith(':free')))
})

test('un modelo configurado que falla usa el router y registra el modelo del respaldo', async () => {
  const models = []
  const result = await requestReport('corpus', { apiKey: 'test', model: 'custom/unavailable:free', fetchImpl: async (_, options) => {
    models.push(JSON.parse(options.body).model)
    return models.length === 1
      ? { ok: true, status: 200, json: async () => ({ error: { code: 404, message: 'Provider returned error' } }) }
      : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(draft) } }] }) }
  } })
  assert.deepEqual(models, ['custom/unavailable:free', 'openrouter/free'])
  assert.equal(result.model, 'openrouter/free')
})
