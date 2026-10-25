import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizeReport } from './report-review.mjs'

test('normaliza mineria.fuentes cuando el modelo devuelve un objeto', () => {
  const report = finalizeReport({ mineria: { fuentes: { a: { fuente: 'OpenAlex', cantidad: 2 } } } })
  assert.ok(Array.isArray(report.mineria.fuentes))
  assert.equal(report.mineria.fuentes[0].fuente, 'OpenAlex')
})
