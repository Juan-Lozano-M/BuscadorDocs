import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizeReport } from './report-review.mjs'

test('local report replaces unsupported prose instead of certifying it', () => {
  const draft = { tema: 'datos', definicion: 'datos comprende información (Autor, 2020)', oportunidades: ['Aplicación empresarial: uso (Autor, 2020)'], referencias: [{ autores: 'Autor', anio: 2020, resumen: 'Existe un resumen' }], registroCambios: [{ evidencia: 'Método local' }], mineria: { documentosAnalizados: 1 } }
  const result = finalizeReport(draft, { local: true })
  assert.match(result.definicion, /DATO FALTANTE/)
  assert.match(result.oportunidades[0], /DATO FALTANTE/)
  assert.equal(result.auditoria.some(row => row.estado === 'OK'), false)
  assert.deepEqual(result.registroCambios, [])
  assert.deepEqual(result.mineria, { ...draft.mineria, palabrasClave: [], fuentes: [], evolucionTemporal: [], decisiones: {} })
  assert.equal(draft.definicion.includes('DATO FALTANTE'), false)
})

test('review retains the complete report and rejects invented changes', () => {
  const result = finalizeReport({ definicion: 'Definición específica.', oportunidades: ['Uso citado.'], hallazgosPrincipales: ['Hallazgo citado.'], registroCambios: [{ antes: 'Inventado', despues: 'Definición específica.', referenciaId: 'fake' }] })
  assert.equal(result.definicion, 'Definición específica.')
  assert.deepEqual(result.hallazgosPrincipales, ['Hallazgo citado.'])
  assert.deepEqual(result.registroCambios, [])
  assert.ok(result.alcance.includes('DATO FALTANTE'))
})
