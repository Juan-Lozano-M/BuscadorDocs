import test from 'node:test'
import assert from 'node:assert/strict'
import { formatReportItem } from './report-format.mjs'

test('conserva sección, estado y nota de auditoría como texto legible', () => {
  assert.equal(formatReportItem({ seccion: 'hallazgosPrincipales', estado: 'PENDIENTE', nota: 'Revisar fuentes.' }),
    'Sección: Hallazgos principales · Estado: PENDIENTE · Nota: Revisar fuentes.')
})

test('conserva antes, después y evidencia del registro de cambios', () => {
  assert.equal(formatReportItem({ antes: 'Texto anterior', despues: 'Texto corregido', evidencia: '(Autor, 2026)' }),
    'Antes: Texto anterior · Después: Texto corregido · Evidencia: (Autor, 2026)')
})

test('admite informes antiguos, valores vacíos y registros anidados', () => {
  assert.equal(formatReportItem('Auditoría previa'), 'Auditoría previa')
  assert.equal(formatReportItem(null), '')
  assert.equal(formatReportItem({ evidencia: ['Fuente 1', { nota: 'Fuente 2' }] }), 'Evidencia: Fuente 1; Nota: Fuente 2')
})
