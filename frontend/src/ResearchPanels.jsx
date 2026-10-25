import { useEffect, useState } from 'react'
import { ArrowUpRight, BookOpen, Braces, ChevronRight, Copy, Check, Play, LoaderCircle } from 'lucide-react'

function SourceLink({ value }) {
  if (!/^https?:\/\//i.test(value || '')) return null
  return <a href={value} target="_blank" rel="noreferrer">Consultar fuente <ArrowUpRight size={14} aria-hidden="true" /></a>
}

function CodePanel({ code, description }) {
  const [feedback, setFeedback] = useState('')
  if (!code?.trim()) return <p className="research-empty">No hay código R disponible para este análisis.</p>
  async function copy() {
    try { await navigator.clipboard.writeText(code); setFeedback('Código copiado') }
    catch { setFeedback('No se pudo copiar. Selecciona el código para copiarlo manualmente.') }
  }
  return <div className="research-code">
    {description && <p>{description}</p>}
    <div className="research-code-bar"><span><Braces size={15} aria-hidden="true" /> R · Código del análisis</span><button type="button" onClick={copy}>{feedback === 'Código copiado' ? <Check size={14} /> : <Copy size={14} />} Copiar código</button></div>
    <pre tabIndex={0} aria-label="Código R"><code>{code}</code></pre>
    <RExecution code={code} />
    <span className="research-feedback" role="status">{feedback}</span>
  </div>
}

export function RExecution({ code }) {
  const [state, setState] = useState({ status: 'idle', output: '', error: '' })
  async function run() {
    setState({ status: 'running', output: '', error: '' })
    try {
      const response = await fetch('/api/ejecutar-r', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: code }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo ejecutar el ejemplo')
      setState({ status: 'done', output: data.salida || 'El código terminó sin salida visible.', error: data.advertencia || '' })
      window.dispatchEvent(new CustomEvent('buscadordocs-action', { detail: { type: 'r' } }))
    } catch (error) {
      setState({ status: 'error', output: '', error: String(error.message || error) })
    }
  }
  return <div className={`r-execution ${state.status}`}>
    <button type="button" onClick={run} disabled={state.status === 'running'}><span>{state.status === 'running' ? <LoaderCircle className="loading-spinner" size={14} /> : <Play size={14} />}</span>{state.status === 'running' ? 'Ejecutando R…' : 'Ejecutar ejemplo'}</button>
    {state.status === 'done' && <pre className="r-execution-output"><code>{state.output}</code></pre>}
    {state.error && <p role="alert">{state.error}</p>}
  </div>
}

function Documents({ documents, scores = false }) {
  if (!documents?.length) return <p className="research-empty">No se recuperaron documentos. Prueba un tema más específico.</p>
  return <ol className="research-documents">{documents.map((doc, index) => <li key={`${doc.doi || doc.titulo}-${index}`}>
    <span className="research-doc-index">{String(index + 1).padStart(2, '0')}</span>
    <div><h4>{doc.titulo}</h4><p>{[doc.autores, doc.anio, doc.fuente].filter(Boolean).join(' · ')}</p>
      <div className="research-doc-footer"><span>{doc.citas ?? 0} {doc.citas === 1 ? 'cita' : 'citas'}{scores && doc.puntaje != null ? ` · ${doc.puntaje}/100 · ${doc.decision || 'sin clasificar'}` : ''}</span><SourceLink value={doc.url || doc.doi} /></div>
    </div>
  </li>)}</ol>
}

export function EvidenceAtlas({ data }) {
  const allDocuments = (data.dataset || []).slice(0, 8)
  const terms = (data.keywords || []).slice(0, 8)
  const [selected, setSelected] = useState(0)
  const [isExploring, setIsExploring] = useState(false)
  const [revealStep, setRevealStep] = useState(allDocuments.length)
  const years = [...(data.years || [])].sort((a, b) => a.year - b.year)
  const [yearIndex, setYearIndex] = useState(Math.max(years.length - 1, 0))
  const yearLimit = years[yearIndex]?.year
  const documents = isExploring ? allDocuments.slice(0, revealStep) : yearLimit ? allDocuments.filter((doc) => !Number(doc.anio) || Number(doc.anio) <= yearLimit) : allDocuments
  useEffect(() => {
    if (allDocuments.length < 2) {
      if (isExploring) setIsExploring(false)
      return undefined
    }
    if (!isExploring) return undefined
    const timer = window.setInterval(() => setRevealStep((step) => {
      if (step >= allDocuments.length) { setIsExploring(false); return step }
      return step + 1
    }), 1000)
    return () => window.clearInterval(timer)
  }, [isExploring, allDocuments.length])
  const center = { x: 380, y: 215 }
  const docNodes = documents.map((doc, index) => {
    const angle = (-Math.PI / 2) + (index / Math.max(documents.length, 1)) * Math.PI * 2
    return { ...doc, x: center.x + Math.cos(angle) * 137, y: center.y + Math.sin(angle) * 137 }
  })
  const termNodes = terms.map((term, index) => {
    const angle = (index / Math.max(terms.length, 1)) * Math.PI * 2 + .2
    return { ...term, x: center.x + Math.cos(angle) * 82, y: center.y + Math.sin(angle) * 82 }
  })
  const selectedDoc = docNodes[selected]
  return <section className="atlas-panel" aria-label={`Atlas de evidencia de ${data.tema}`}>
    <div className="atlas-heading"><div><span className="research-eyebrow">Atlas de evidencia</span><h4>Cómo se conecta “{data.tema}”</h4><p>El centro es tu tema; los nodos muestran documentos y conceptos extraídos del corpus.</p></div><div className="atlas-heading-actions"><button className={`atlas-play ${isExploring ? 'is-playing' : ''}`} type="button" disabled={allDocuments.length < 2} onClick={() => { if (allDocuments.length < 2) return; window.dispatchEvent(new CustomEvent('buscadordocs-action', { detail: { type: 'atlas', topic: data.tema } })); setRevealStep(1); setIsExploring((value) => !value) }}>{allDocuments.length < 2 ? 'Sin suficientes documentos' : isExploring ? 'Pausar recorrido' : 'Explorar recorrido'}</button><span className="atlas-count">{documents.length} documentos · {terms.length} conceptos</span></div></div>
    {documents.length ? <div className="atlas-layout">
      <div className="atlas-map-wrap">
        <svg className="atlas-map" viewBox="120 0 520 430" role="img" aria-label="Mapa de conexiones entre tema, documentos y conceptos">
          <defs><radialGradient id="atlas-glow"><stop offset="0" stopColor="#f4c95d" stopOpacity=".32" /><stop offset="1" stopColor="#f4c95d" stopOpacity="0" /></radialGradient></defs>
          <circle cx={center.x} cy={center.y} r="116" fill="url(#atlas-glow)" />
          {docNodes.map((doc, index) => <line className="atlas-link atlas-link-doc" key={`link-${index}`} x1={center.x} y1={center.y} x2={doc.x} y2={doc.y} />)}
          {docNodes.map((doc, index) => terms.slice(0, 2).map((term, termIndex) => <line className="atlas-link atlas-link-term" key={`term-link-${index}-${termIndex}`} x1={doc.x} y1={doc.y} x2={termNodes[(index + termIndex) % termNodes.length]?.x || center.x} y2={termNodes[(index + termIndex) % termNodes.length]?.y || center.y} />))}
          {termNodes.map((term) => <g className="atlas-term" key={term.word} transform={`translate(${term.x} ${term.y})`}><circle r="22" /><text textAnchor="middle" dy="4">{term.word.slice(0, 12)}</text></g>)}
          {docNodes.map((doc, index) => <g className={`atlas-document ${selected === index ? 'is-selected' : ''} ${isExploring ? 'atlas-node-reveal' : ''}`} style={{ animationDelay: `${index * 110}ms` }} key={`${doc.titulo}-${index}`} transform={`translate(${doc.x} ${doc.y})`} role="button" tabIndex="0" aria-label={`Seleccionar documento ${doc.titulo}`} onClick={() => setSelected(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelected(index) }}><circle r="28" /><text className="atlas-doc-number" textAnchor="middle" dy="5">{String(index + 1).padStart(2, '0')}</text></g>)}
          <g className={`atlas-topic ${isExploring ? 'atlas-topic-pulse' : ''}`} transform={`translate(${center.x} ${center.y})`}><circle r="48" /><text textAnchor="middle"><tspan x="0" dy="-2">{String(data.tema || 'tema').slice(0, 15)}</tspan><tspan x="0" dy="17">TEMA</tspan></text></g>
        </svg>
        <div className="atlas-legend"><span><i className="legend-topic" /> Tema</span><span><i className="legend-doc" /> Documento</span><span><i className="legend-term" /> Concepto</span></div>
        {years.length > 0 && <div className="atlas-timeline"><div><span className="micro-label">Recorrido temporal</span><strong>{yearLimit || years.at(-1).year}</strong></div><input type="range" min="0" max={years.length - 1} value={yearIndex} onChange={(event) => { setIsExploring(false); setYearIndex(Number(event.target.value)) }} aria-label="Año de la evidencia" /><div className="atlas-timeline-years"><span>{years[0].year}</span><span>{years.at(-1).year}</span></div></div>}
      </div>
      <aside className="atlas-detail" aria-live="polite">
        {selectedDoc ? <><span className="micro-label">Documento seleccionado · {String(selected + 1).padStart(2, '0')}</span><h5>{selectedDoc.titulo}</h5><p>{[selectedDoc.anio, selectedDoc.fuente].filter(Boolean).join(' · ')}</p><div className="atlas-detail-stats"><span><b>{selectedDoc.puntaje || 0}</b>/100 puntaje</span><span><b>{selectedDoc.citas || 0}</b> citas</span></div>{selectedDoc.resumen && <p className="atlas-summary">{String(selectedDoc.resumen).slice(0, 220)}{String(selectedDoc.resumen).length > 220 ? '…' : ''}</p>}<SourceLink value={selectedDoc.url || selectedDoc.doi} /></> : <p className="research-empty">No hay documentos para mapear.</p>}
      </aside>
    </div> : <p className="research-empty">El atlas necesita documentos recuperados para construir conexiones.</p>}
  </section>
}

export function EvidenceExplorer({ data }) {
  const [view, setView] = useState('overview')
  const [allTerms, setAllTerms] = useState(false)
  const documents = data.dataset || [], terms = data.keywords || []
  const years = [...(data.years || [])].sort((a, b) => a.year - b.year)
  const maxCount = Math.max(1, ...years.map(item => item.count))
  const missingYears = years.length ? Array.from({ length: years.at(-1).year - years[0].year + 1 }, (_, i) => years[0].year + i).filter(year => !years.some(item => item.year === year)) : []
  return <section className="evidence-explorer" aria-label="Evidencia bibliográfica del tema">
    <header className="research-heading"><div><span className="research-eyebrow">Explora la evidencia</span><h3>Una primera mirada a “{data.tema}”</h3></div><span className="research-source"><BookOpen size={14} aria-hidden="true" /> {data.fuente || 'OpenAlex'}</span></header>
    <p className="research-intro">{documents.length ? `${documents.length} documentos recuperados. Explora sus términos y fechas antes de generar el informe.` : 'No encontramos documentos para analizar. Prueba con un término más específico o revisa la conexión.'}</p>
    <div className="research-switch" role="group" aria-label="Contenido de la evidencia">
      {[['overview', 'Panorama'], ['atlas', 'Atlas'], ['documents', `Documentos (${documents.length})`], ['code', 'Código R']].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
    </div>
    {view === 'overview' && <div className="research-overview">
      <section><h4>Términos más frecuentes</h4><p className="research-caption">Apariciones en títulos y resúmenes; no indican relevancia por sí solas.</p>
        <div className="research-terms">{(allTerms ? terms : terms.slice(0, 6)).map(item => <span key={item.word} title={`${item.count} apariciones`}><span>{item.word}</span><b>{item.count}<span className="research-sr-only"> apariciones</span></b></span>)}</div>
        {!terms.length && <p className="research-empty">No hay términos suficientes para mostrar.</p>}
        {terms.length > 6 && <button className="research-text-button" type="button" aria-expanded={allTerms} onClick={() => setAllTerms(!allTerms)}>{allTerms ? 'Mostrar menos' : `Ver los ${terms.length} términos`}</button>}
      </section>
      <section><h4>Documentos por año</h4><p className="research-caption">{years.length ? `${years[0].year}–${years.at(-1).year} · ${years.length} ${years.length === 1 ? 'año con documentos' : 'años con documentos'}` : 'Sin fechas disponibles'}</p>
        <div className="research-timeline">{years.map(item => <div key={item.year} aria-label={`${item.year}: ${item.count} documentos`}><span>{item.year}</span><div className="research-track"><span style={{ width: `${item.count / maxCount * 100}%` }} /></div><b>{item.count}</b></div>)}</div>
        {missingYears.length > 0 && <p className="research-caption">Sin documentos en {missingYears.join(', ')}.</p>}
      </section>
    </div>}
    {view === 'atlas' && <EvidenceAtlas data={data} />}
    {view === 'documents' && <Documents documents={documents} />}
    {view === 'code' && <CodePanel code={data.codeR} description="Este código explora el corpus documental. Requiere el CSV indicado en el ejemplo." />}
  </section>
}

function Fold({ title, count, children }) {
  return <details className="research-fold"><summary><ChevronRight size={17} aria-hidden="true" /><span>{title}</span>{count != null && <small>{count}</small>}</summary><div className="research-fold-body">{children}</div></details>
}

export function ReportReader({ report }) {
  const opportunities = [...new Set((report.oportunidades || []).map(item => String(item).replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/¿para qué sirve\?\s*/gi, '').replace(/\bno evidenciado en el corpus\b/gi, '').replace(/\s+/g, ' ').trim()).filter(Boolean))]
  return <div className="report-reader">
    <header className="research-heading"><div><span className="research-eyebrow">Informe generado</span><h3>{report.tema}</h3></div><span className="research-source">{report.fecha}</span></header>
    <section className="research-definition"><h4>¿Qué es?</h4><p>{report.definicion}</p></section>
    {report.hallazgosPrincipales?.length > 0 && <Fold title="Hallazgos principales" count={report.hallazgosPrincipales.length}><ul>{report.hallazgosPrincipales.map((item, i) => <li key={i}>{item}</li>)}</ul></Fold>}
    <Fold title="Aplicaciones y oportunidades" count={opportunities.length}>{opportunities.length ? <ul>{opportunities.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="research-empty">No se encontraron aplicaciones respaldadas en la evidencia disponible.</p>}</Fold>
    <Fold title="Ejemplo en R"><CodePanel code={report.ejemploR?.codigo} description={report.ejemploR?.descripcion} /></Fold>
    <Fold title="Fuentes del informe" count={report.referencias?.length || 0}><Documents documents={report.referencias} scores /></Fold>
    <Fold title="Alcance, límites y trazabilidad">
      {report.alcance && <><h4>Alcance</h4><p>{report.alcance}</p></>}
      {report.limitaciones?.length > 0 && <><h4>Limitaciones</h4><ul>{report.limitaciones.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
      {report.pipeline && <p>Se recuperaron {report.pipeline.recibidos} resultados, quedaron {report.pipeline.unicos} documentos únicos y se seleccionaron {report.pipeline.top5} para el informe.</p>}
      {report.nota && <p>{report.nota}</p>}
      {report.documentosLocales?.length > 0 && <><h4>Base local</h4><ul>{report.documentosLocales.map(item => <li key={item.archivo}>{item.titulo} · {item.archivo}</li>)}</ul></>}
    </Fold>
    {report.conclusiones?.length > 0 && <Fold title="Conclusiones y recomendaciones"><ul>{report.conclusiones.map((item, i) => <li key={i}>{item}</li>)}</ul></Fold>}
  </div>
}
