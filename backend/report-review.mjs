// Conservative checks before a report is exposed or stored. Presence of a
// citation is not a semantic verification of its supporting abstract.
export function finalizeReport(draft, { local = false } = {}) {
  const report = structuredClone(draft)
  report.mineria = normalizeMining(report.mineria)
  report.consultas = normalizeList(report.consultas)
  report.documentosLocales = normalizeList(report.documentosLocales)
  const missing = new Set(report.datosFaltantes || [])
  const template = /tema aplicado|se presenta en la evidencia|se adoptó el sentido.*domina|apoyo a la toma de decisiones, análisis de demanda|organización y consulta de terminologías|evaluación y reutilización de proyectos|apoyo al aprendizaje y evaluación/i
  const fields = ['alcance', 'definicion', 'hallazgosPrincipales', 'oportunidades', 'conceptosInterpretacion', 'limitaciones', 'conclusiones']
  const audit = []
  const changes = []
  for (const field of fields) {
    const original = report[field]
    const values = Array.isArray(original) ? original : [original]
    const needsSynthesis = local && ['alcance', 'definicion', 'hallazgosPrincipales', 'oportunidades'].includes(field)
    const corrected = values.map(value => {
      if (needsSynthesis || typeof value !== 'string' || !value.trim() || template.test(value)) {
        const reason = `${field}: síntesis específica contrastada con los resúmenes del corpus`
        missing.add(reason)
        return `[DATO FALTANTE: ${reason}]`
      }
      return value
    })
    report[field] = Array.isArray(original) || ['hallazgosPrincipales', 'oportunidades', 'limitaciones', 'conclusiones'].includes(field)
      ? [...new Set(corrected)] : corrected[0]
    audit.push({ seccion: field, estado: corrected.some(v => v.includes('[DATO FALTANTE:')) ? 'FALTA' : 'PENDIENTE', nota: 'No se certifica respaldo semántico mediante coincidencias de palabras.' })
  }
  // Only accept changes with literal excerpts in the draft and final text,
  // and a reference explicitly present in the supplied corpus.
  for (const row of draft.registroCambios || []) {
    const before = row.antes?.trim(), after = row.despues?.trim()
    const ref = (report.referencias || []).find(r => (r.doi || r.url || r.titulo) === row.referenciaId)
    const oldText = JSON.stringify(draft[row.campo] || '')
    const newText = JSON.stringify(report[row.campo] || '')
    if (!before || !after || before === after || !ref || !ref.autores || !ref.anio) continue
    if (before.split(/\s+/).length > 15 || after.split(/\s+/).length > 15) continue
    if (!oldText.includes(before) || !newText.includes(after) || newText.includes(before)) continue
    changes.push({ ...row, evidencia: `(${ref.autores}, ${ref.anio})` })
  }
  report.auditoria = audit
  report.registroCambios = changes
  report.datosFaltantes = [...missing]
  return report
}

function normalizeList(value) {
  if (Array.isArray(value)) return value
  return value && typeof value === 'object' ? Object.values(value) : []
}

function normalizeMining(value) {
  const mineria = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    ...mineria,
    palabrasClave: normalizeList(mineria.palabrasClave),
    evolucionTemporal: normalizeList(mineria.evolucionTemporal),
    fuentes: normalizeList(mineria.fuentes),
    decisiones: mineria.decisiones && typeof mineria.decisiones === 'object' ? mineria.decisiones : {},
  }
}
