const labels = {
  seccion: 'Sección', estado: 'Estado', nota: 'Nota', campo: 'Campo',
  antes: 'Antes', despues: 'Después', evidencia: 'Evidencia',
  referenciaId: 'Referencia', problema: 'Problema', correccion: 'Corrección',
}
const sections = {
  alcance: 'Alcance', definicion: 'Definición',
  hallazgosPrincipales: 'Hallazgos principales', oportunidades: 'Aplicaciones y oportunidades',
  conceptosInterpretacion: 'Conceptos clave', limitaciones: 'Limitaciones', conclusiones: 'Conclusiones',
}

// Keep legacy string entries and structured records readable in exported reports.
// HTML escaping belongs to the renderer, after this conversion.
export function formatReportItem(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(formatReportItem).filter(Boolean).join('; ')
  if (typeof value !== 'object') return String(value)
  return Object.entries(value).map(([key, item]) => {
    const text = formatReportItem(item)
    if (!text) return ''
    const display = key === 'seccion' || key === 'campo' ? sections[text] || text : text
    return `${labels[key] || key}: ${display}`
  }).filter(Boolean).join(' · ')
}
