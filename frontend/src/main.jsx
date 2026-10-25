import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { formatReportItem } from './report-format.mjs'
import { EvidenceExplorer, EvidenceAtlas, ReportReader, RExecution } from './ResearchPanels'
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Braces,
  ChevronRight,
  CircleHelp,
  Database,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  Play,
  Search,
  Sparkles,
  House,
  Upload,
  MessageCircle,
  Send,
  Copy,
  Network,
  Route,
  CircleCheck,
  Volume2,
  VolumeX,
  Settings2,
  RotateCcw,
} from 'lucide-react'
import './styles.css'
import './research.css'

function readProgress() {
  try { return JSON.parse(localStorage.getItem('buscadordocs-progress') || '{"searches":0,"atlas":0,"rRuns":0,"reports":0}') } catch { return { searches: 0, atlas: 0, rRuns: 0, reports: 0 } }
}

function markProgress(key) {
  const current = readProgress()
  const next = { ...current, [key]: (current[key] || 0) + 1 }
  localStorage.setItem('buscadordocs-progress', JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('buscadordocs-progress', { detail: next }))
  return next
}

function recordResearchEvent(type, detail = {}) {
  const labels = { search: 'Búsqueda', dataset: 'Dataset preparado', analysis: 'Análisis ejecutado', r: 'Código R ejecutado', atlas: 'Recorrido del Atlas', save: 'Informe guardado' }
  const context = [detail.topic, detail.filename, detail.method, detail.target, detail.source, detail.rows ? `${detail.rows} filas × ${detail.columns || '?'} columnas` : ''].filter(Boolean).join(' · ')
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), type, title: labels[type] || 'Actividad de investigación', detail: context || detail.note || '' }
  try {
    const previous = JSON.parse(localStorage.getItem('buscadordocs-diary') || '[]')
    const next = [entry, ...(Array.isArray(previous) ? previous : [])].slice(0, 100)
    localStorage.setItem('buscadordocs-diary', JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('buscadordocs-diary', { detail: next }))
  } catch { /* la bitácora local nunca debe interrumpir una acción del laboratorio */ }
}

function playArcadeSound(kind = 'tap') {
  if (localStorage.getItem('buscadordocs-sound') !== 'on') return
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const audio = new AudioContextClass()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    const frequencies = { tap: 440, success: 660, run: 520, error: 180 }
    oscillator.frequency.value = frequencies[kind] || frequencies.tap
    oscillator.type = 'square'
    gain.gain.setValueAtTime(0.035, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (kind === 'success' ? 0.18 : 0.08))
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.2)
    oscillator.addEventListener('ended', () => audio.close())
  } catch { /* el sonido es opcional y no debe bloquear la interfaz */ }
}

const latexDocuments = import.meta.glob('../../shared/unidad-1/latex/*.tex', { query: '?raw', import: 'default', eager: true })

function cleanLatex(value) {
  return value
    .replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}/g, '')
    .replace(/\\url\{([^}]+)\}/g, '$1')
    .replace(/\\([_&#%$])/g, '$1')
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^]]*\])?\{([^}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
}

function cleanReportText(value = '') {
  return decodeHtmlEntities(value)
    .replace(/¿para qué sirve\?\s*/gi, '')
    .replace(/\bno evidenciado en el corpus\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeading(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const categoryRules = [
  ['Bases de datos', /base de datos|database|sql|postgres|relacional/],
  ['Minería de datos', /mineria de datos|data mining|kdd|crisp|mining/],
  ['Machine learning', /machine learning|aprendizaje automatico|clasific|regres|cluster|predic/],
  ['IA', /inteligencia artificial|\bartificial intelligence\b|\bai\b|\bdeep learning\b/],
  ['Desarrollo', /desarrollo|software|scrum|program|agil|agile|web|react|implement/],
  ['Visualización', /visualiz|dashboard|grafica|gráfica|chart/],
  ['Estadística', /estadistic|statistic|probabilidad|correlacion|métrica|metric/],
  ['Datos', /\bdatos?\b|\bdata\b|etl|warehouse|supabase|dataset/],
]

function classifyTopic(...values) {
  const text = normalizeHeading(values.filter(Boolean).join(' '))
  const category = categoryRules.find(([, pattern]) => pattern.test(text))?.[0]
  return [category || 'Otros']
}

function improveTopicDefinition(title, rawDefinition) {
  if (!/respaldado por \d+ documento\(s\) de alta coincidencia/i.test(rawDefinition)) return rawDefinition
  const text = normalizeHeading(title)
  if (/inteligencia artificial|artificial intelligence/.test(text)) return `${title} es el campo de la computación que desarrolla sistemas capaces de aprender de datos, reconocer patrones y apoyar decisiones o generar resultados.`
  if (/mineria de datos|data mining/.test(text)) return `${title} es el proceso de explorar datos para descubrir patrones, relaciones y señales útiles que apoyen decisiones.`
  if (/^machine$|machine learning|aprendizaje automatico/.test(text)) return `${title} reúne métodos que permiten a los sistemas aprender patrones a partir de datos y mejorar sus predicciones.`
  if (/base de datos|database|sql|postgres/.test(text)) return `${title} es una estructura organizada para almacenar, consultar y relacionar información de forma consistente y trazable.`
  if (/arepa|maiz|corn|alimento|food|gastronom/.test(text)) return `${title} se aborda como un producto alimentario y una actividad productiva, con énfasis en su elaboración, comercialización y fortalecimiento empresarial.`
  return `${title} es un tema de estudio aplicado cuyo alcance se concreta en los métodos, problemas y resultados descritos por la evidencia recuperada.`
}

function translateOpportunity(value) {
  // Preserve the reviewed text, citations and explicit missing-data markers.
  return value
}

function parseSavedReport(source) {
  const sections = [...source.matchAll(/\\section\{([^}]*)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/g)]
  const section = (name) => cleanLatex(sections.find(([_, heading]) => normalizeHeading(heading).includes(normalizeHeading(name)))?.[2] ?? '')
  const sectionRaw = (name) => sections.find(([_, heading]) => normalizeHeading(heading).includes(normalizeHeading(name)))?.[2] ?? ''
  const items = (name) => [...sectionRaw(name).matchAll(/\\item\s+([\s\S]*?)(?=\\item|\\end\{itemize\}|\\end\{enumerate\}|$)/g)].map((match) => cleanLatex(match[1])).filter(Boolean)
  const code = source.match(/\\begin\{lstlisting\}([\s\S]*?)\\end\{lstlisting\}/)?.[1]?.trim() || '# El informe no contiene código R'
  const date = source.match(/\\date\{([^}]*)\}/)?.[1] || ''
  const title = cleanLatex(source.match(/\\title\{([^}]*)\}/)?.[1] || '')
  const referenceItems = items('referencias')
  const categories = classifyTopic(title, source)
  const fichaRaw = sectionRaw('ficha')
  const metodo = cleanLatex(fichaRaw.split(/\\subsection\{/i)[0]) || 'Documento LaTeX guardado en Supabase'
  return {
    fecha: cleanLatex(date),
    metodo,
    pipeline: section('pipeline'),
    alcance: section('alcance'),
    definicion: improveTopicDefinition(title, section('definición')),
    oportunidades: [...new Set((items('aplicaciones y oportunidades').length ? items('aplicaciones y oportunidades') : [section('aplicaciones y oportunidades')].filter(Boolean)).map((item) => cleanReportText(translateOpportunity(item))).filter(Boolean))],
    hallazgosPrincipales: items('hallazgos principales'),
    conceptosInterpretacion: section('conceptos clave'),
    limitaciones: items('limitaciones'),
    conclusiones: items('conclusiones y recomendaciones'),
    auditoria: items('auditoría editorial'),
    registroCambios: items('registro de cambios'),
    datosFaltantes: items('datos faltantes'),
    ejemploR: { descripcion: cleanLatex(sectionRaw('ejemplo en r').replace(/\\begin\{lstlisting\}[\s\S]*?\\end\{lstlisting\}/, '')), codigo: code },
    referencias: referenceItems.map((reference) => ({ titulo: reference, raw: true })),
    nota: section('nota metodológica') || section('nota'),
    consultas: items('consultas'),
    tituloFuente: title,
  }
}

function parseLatexTopic(source, path, index, saved = false) {
  const title = cleanLatex(source.match(/\\title\{([^}]*)\}/)?.[1] ?? path.split('/').pop().replace('.tex', '')).replace(/^Informe de minería de datos:\s*/i, '')
  const categories = classifyTopic(title, source)
  const sections = [...source.matchAll(/\\section\{([^}]*)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/g)]
  const getSection = (name) => cleanLatex(sections.find(([_, heading]) => normalizeHeading(heading).includes(normalizeHeading(name)))?.[2] ?? '')
  const code = source.match(/\\begin\{lstlisting\}([\s\S]*?)\\end\{lstlisting\}/)?.[1]?.trim() ?? '# Este documento todavía no tiene un ejemplo en R'
  const id = `${saved ? 'SAVED' : 'LATEX'}-${path.split('/').pop().replace('.tex', '').toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`
  const opportunity = getSection('aplicación') || getSection('relación') || getSection('ventaja') || cleanLatex(sections.find(([_, heading]) => !['definición', 'ejemplo', 'referencias'].some((term) => normalizeHeading(heading).includes(term)))?.[2] ?? '')
  const report = saved ? parseSavedReport(source) : null
  const cleanOpportunities = (report?.oportunidades || []).map(cleanReportText).filter(Boolean)
  const opportunityText = cleanOpportunities.length
    ? cleanOpportunities.slice(0, 2).join(' ')
    : cleanReportText(opportunity) || 'No hay aplicaciones respaldadas en la evidencia disponible.'
  return {
    id,
    number: String(index + 1).padStart(2, '0'),
    title,
    short: getSection('definición').slice(0, 52) || 'Tema añadido desde LaTeX',
    icon: BookOpen,
    definition: improveTopicDefinition(title, getSection('definición') || `Contenido extraído de ${title}.`),
    opportunity: opportunityText,
    example: 'Ejemplo extraído del documento LaTeX.',
    code,
    tags: [...categories, ...(saved ? ['Guardado'] : ['Base'])],
    categories,
    saved,
    source,
    report,
  }
}

const generatedTopics = Object.entries(latexDocuments)
  .map(([path, source], index) => parseLatexTopic(source, path, index))
const topics = generatedTopics

function buildAssistedQueries(tema) {
  const t = tema.trim()
  return [
    { key: 'scholar', label: 'Principal · Google Scholar', query: `("${t}") AND (definition OR definición OR methodology OR metodología OR application* OR aplicación*) AND (data mining OR "minería de datos" OR analytics)`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${t}" data mining`) }` },
    { key: 'scopus', label: 'Scopus / WoS · TITLE-ABS-KEY', query: `TITLE-ABS-KEY (("${t}") AND (definition OR methodology OR application* OR framework*) AND ("data mining" OR analytics))`, url: `https://www.scopus.com/search/form.uri?display=basic#basic` },
    { key: 'review', label: 'Revisión sistemática', query: `("${t}") AND ("systematic review" OR "literature review" OR "revisión sistemática" OR survey) AND (method* OR framework* OR application*)`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${t}" systematic review`)}` },
    { key: 'apps', label: 'Aplicaciones', query: `("${t}") AND (application* OR "case study" OR "estudio de caso" OR business) AND (result* OR evaluation OR performance)`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${t}" application case study`)}` },
    { key: 'eval', label: 'Métodos y evaluación', query: `("${t}") AND (model* OR algorithm* OR method*) AND (validation OR validación OR metric* OR comparison)`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${t}" validation metrics`)}` },
    { key: 'r', label: 'Aplicaciones en R', query: `("${t}") AND (R OR "R programming" OR CRAN OR tidyverse) AND (example* OR ejemplo* OR implementation OR reproducib*)`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${t}" R programming example`)}` },
    { key: 'openalex', label: 'OpenAlex · verificación abierta', query: t, url: `https://openalex.org/works?search=${encodeURIComponent(t)}` },
  ]
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildProtocolMarkdown(tema, queries) {
  return `# Búsqueda asistida: ${tema}\n\nFecha: ${new Date().toISOString().slice(0, 10)}\nMétodo: protocolo de búsqueda bibliográfica (10 pasos, umbral 80/100)\n\n## Consultas generadas\n\n${queries.map((q) => `### ${q.label}\n\n\`\`\`text\n${q.query}\n\`\`\`\n\nEjecutar: ${q.url}\n`).join('\n')}\n## Procedimiento\n\n1. Ejecutar consulta principal en Scholar. 2. Ejecutar TITLE-ABS-KEY en Scopus/WoS. 3. Ejecutar revisión, aplicaciones, evaluación y R. 4. Registrar título, autores, año, DOI, citas. 5. Eliminar duplicados. 6. Puntuar 80/100 (30 pertinencia temática + 20 contexto + 15 calidad + 15 método + 10 actualidad + 10 aplicabilidad). 7. Sintetizar definición + oportunidades + ejemplo R + BibTeX.\n`
}

const demoCsv = `cliente,edad,ingreso,compras,segmento
Ana,24,1800,3,estudiante
Luis,31,4200,8,profesional
Marta,45,6800,14,profesional
Jorge,22,1500,2,estudiante
Sofia,38,5200,11,profesional
Camilo,29,3100,6,emprendedor
Valentina,52,7600,16,profesional
Diego,27,2500,4,emprendedor
Laura,41,6100,13,profesional
Nicolas,20,1200,1,estudiante`

function Laboratory({ topics = [] }) {
  const [file, setFile] = useState({ name: '', content: '' })
  const [profile, setProfile] = useState(null)
  const [method, setMethod] = useState('explore')
  const [target, setTarget] = useState('')
  const [k, setK] = useState(3)
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState(topics[0]?.id || '')
  const [datasetSource, setDatasetSource] = useState('synthetic')

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) || topics[0]

  async function loadCsv(nextFile) {
    const content = await nextFile.text()
    setFile({ name: nextFile.name, content })
    setResult(null)
    setError('')
    setStatus('profiling')
    try {
      const response = await fetch('/api/datasets/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: nextFile.name, content }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Backend ${response.status}`)
      setProfile(data)
      window.dispatchEvent(new CustomEvent('buscadordocs-action', { detail: { type: 'dataset', filename: nextFile.name, rows: data.rows, columns: data.columns, source: /^documentos_/i.test(nextFile.name) ? 'documentos recuperados' : 'CSV' } }))
      if (/^documentos_/i.test(nextFile.name) || data.headers.includes('resumen')) setMethod('text-mining')
      setTarget(data.columnsInfo.find((column) => column.type === 'numeric')?.name || data.headers[0] || '')
      setStatus('ready')
    } catch (e) {
      setStatus('error')
      setError(String(e.message || e))
    }
  }

  function useDemo() {
    loadCsv(new File([demoCsv], 'clientes_demo.csv', { type: 'text/csv' }))
  }

  function createTestCsv() {
    const filename = 'mineria_prueba_clientes.csv'
    downloadText(filename, demoCsv)
    loadCsv(new File([demoCsv], filename, { type: 'text/csv' }))
  }

  function createTopicCsv() {
    const topic = selectedTopic
    const title = topic?.title || 'tema de minería de datos'
    const area = topic?.categories?.[0] || 'Minería de datos'
    const safe = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 35) || 'tema'
    const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const header = 'tema;area;periodo;observaciones;valor;segmento;calidad_dato'
    const rows = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0')
      const value = 42 + ((title.length * (index + 3) + index * 17) % 58)
      const observations = 18 + ((title.length + index * 7) % 41)
      const segment = ['inicial', 'intermedio', 'avanzado'][index % 3]
      const quality = 82 + ((index * 3 + title.length) % 18)
      return [title, area, `2026-${month}`, observations, value, segment, quality].map(cell).join(';')
    })
    const csv = `\ufeff${header}\n${rows.join('\n')}\n`
    const filename = `datos_${safe}.csv`
    downloadText(filename, csv)
    loadCsv(new File([csv], filename, { type: 'text/csv' }))
  }

  async function createEvidenceCsv() {
    const title = selectedTopic?.title || ''
    if (!title) return
    setStatus('profiling')
    setError('')
    try {
      const response = await fetch('/api/topic-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tema: title }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Backend ${response.status}`)
      if (!data.dataset?.length) throw new Error('No hay documentos recuperados para este tema. Comprueba la conexión con OpenAlex.')
      const cell = (value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
      const header = 'tema;titulo;autores;anio;fuente;citas;puntaje;decision;doi;resumen'
      const rows = data.dataset.map((item) => [title, item.titulo, item.autores, item.anio, item.fuente, item.citas, item.puntaje, item.decision, item.doi, item.resumen].map(cell).join(';'))
      const csv = `\ufeff${header}\n${rows.join('\n')}\n`
      const safe = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 35) || 'tema'
      const filename = `documentos_${safe}.csv`
      downloadText(filename, csv)
      loadCsv(new File([csv], filename, { type: 'text/csv' }))
    } catch (e) {
      setStatus('error')
      setError(String(e.message || e))
    }
  }

  async function runAnalysis() {
    if (!file.content) return
    setStatus('running')
    setError('')
    try {
      const response = await fetch('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...file, method, k, target }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Backend ${response.status}`)
      setResult(data)
      setStatus('complete')
      window.dispatchEvent(new CustomEvent('buscadordocs-action', { detail: { type: 'analysis', filename: file.name, method, target } }))
    } catch (e) {
      setStatus('error')
      setError(String(e.message || e))
    }
  }

  return (
    <section className="laboratory" aria-labelledby="lab-title">
      <div className="lab-hero">
        <div>
          <div className="stage-kicker"><span className="line" /> Laboratorio de análisis</div>
          <h2 id="lab-title">De la pregunta al <em>hallazgo.</em></h2>
          <p>Sube un CSV y descubre su calidad, sus patrones y los siguientes pasos de minería de datos.</p>
        </div>
        <div className="lab-signature"><Database size={19} /><span>flujo reproducible<br /><strong>datos → evidencia</strong></span></div>
      </div>
      <div className="lab-grid">
        <div className="lab-input-column">
          <label className="dropzone" htmlFor="dataset-upload">
            <Upload size={24} />
            <strong>{file.name || 'Carga tu dataset'}</strong>
            <span>CSV de hasta 5 MB · arrastra o selecciona un archivo</span>
            <input id="dataset-upload" type="file" accept=".csv,text/csv" onChange={(event) => event.target.files[0] && loadCsv(event.target.files[0])} />
          </label>
          {topics.length > 0 && <label className="topic-dataset-select">Tema del CSV<select value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select><small>Se crearán registros sintéticos relacionados con el tema elegido.</small></label>}
          <label className="dataset-source-select">Origen del dataset<select value={datasetSource} onChange={(event) => setDatasetSource(event.target.value)}><option value="synthetic">Información sintética del tema</option><option value="evidence">Documentos recuperados</option></select><small>Elige entre datos de prueba o evidencia bibliográfica recuperada.</small></label>
          <button className="demo-button create-test-button" type="button" onClick={datasetSource === 'evidence' ? createEvidenceCsv : createTopicCsv}>{datasetSource === 'evidence' ? 'Extraer documentos recuperados' : 'Crear CSV sintético'}</button>
          <button className="demo-button" type="button" onClick={useDemo}>Probar con dataset de demostración</button>
          {status === 'profiling' && <p className="lab-status"><LoaderCircle className="loading-spinner" size={15} /> Revisando estructura y calidad…</p>}
          {status === 'error' && <p className="lab-error">{error}</p>}
        </div>
        <div className="lab-profile">
          {!profile ? (
            <div className="lab-empty"><Sparkles size={18} /><span>El diagnóstico aparecerá aquí después de cargar los datos.</span></div>
          ) : (
            <>
              <div className="lab-profile-head"><div><span className="micro-label">Diagnóstico inicial</span><strong>{profile.filename}</strong></div><div className={`quality-score ${profile.quality >= 80 ? 'good' : 'warn'}`}>{profile.quality}<small>/100 calidad</small></div></div>
              <div className="lab-metrics"><span><strong>{profile.rows.toLocaleString()}</strong> filas</span><span><strong>{profile.columns}</strong> columnas</span><span><strong>{profile.missingCells}</strong> faltantes</span><span><strong>{profile.duplicateRows}</strong> duplicadas</span></div>
              <div className="lab-columns">{profile.columnsInfo.map((column) => <span key={column.name} className={column.missing ? 'has-warning' : ''}><i />{column.name}<small>{column.type}</small></span>)}</div>
            </>
          )}
        </div>
      </div>
      {profile && (
        <div className="lab-experiment">
          {file.name.startsWith('documentos_') && <button className={`document-mining-choice ${method === 'text-mining' ? 'selected' : ''}`} type="button" onClick={() => setMethod('text-mining')}><span>Corpus documental</span><strong>Extraer temas y términos</strong><small>Analiza títulos y resúmenes con frecuencia documental y TF-IDF.</small></button>}
          <div className="lab-experiment-heading"><div><span className="micro-label">Siguiente paso</span><h3>¿Qué quieres descubrir?</h3></div><button className="run-analysis" type="button" onClick={runAnalysis} disabled={status === 'running'}><Play size={14} />{status === 'running' ? 'Analizando…' : 'Ejecutar análisis'}</button></div>
          <div className="method-grid">
            {[['explore', 'Explorar patrones', 'Relaciones y variables que se mueven juntas', 'Mapa'], ['cluster', 'Segmentar perfiles', 'Agrupa registros con comportamientos parecidos', 'k-means'], ['anomaly', 'Detectar anomalías', 'Encuentra registros fuera del comportamiento normal', 'Outliers'], ['regression', 'Predecir un valor', 'Estima una variable numérica a partir de otras', 'Regresión'], ['classification', 'Clasificar registros', 'Predice categorías como riesgo, tipo o segmento', 'Clasificación']].map(([value, title, description, tag]) => <button key={value} type="button" className={`method-card ${method === value ? 'selected' : ''}`} onClick={() => setMethod(value)}><span>{tag}</span><strong>{title}</strong><small>{description}</small></button>)}
          </div>
          {method === 'cluster' && <label className="k-control">Número de perfiles <input type="number" min="2" max="6" value={k} onChange={(event) => setK(event.target.value)} /></label>}
          {(method === 'regression' || method === 'classification') && <label className="target-control">Variable objetivo <select value={target} onChange={(event) => setTarget(event.target.value)}>{profile.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select><small>El modelo intentará explicar o predecir esta columna.</small></label>}
        </div>
      )}
      {result && (
        <div className="lab-result">
          {result.result.textMining && <div className="document-mining-result"><div><span className="micro-label">Términos priorizados</span><div className="keyword-cloud">{result.result.textMining.topTerms.map((item) => <span key={item.term}>{item.term}<small>TF-IDF {item.tfidf}</small></span>)}</div></div><div className="document-mining-columns"><div><strong>Evolución documental</strong>{result.result.textMining.years.map((item) => <span key={item.year}>{item.year}: {item.count}</span>)}</div><div><strong>Fuentes principales</strong>{result.result.textMining.sources.map((item) => <span key={item.fuente}>{item.fuente}: {item.count}</span>)}</div></div>{result.result.textMining.coocurrencias.length > 0 && <div className="document-relations"><strong>Relaciones entre términos</strong>{result.result.textMining.coocurrencias.map((item) => <span key={item.relacion}>{item.relacion} · {item.frecuencia}</span>)}</div>}</div>}
          <div className="lab-result-heading"><div><span className="micro-label">Resultado interpretable</span><h3>{result.result.title}</h3></div><CheckCircle2 size={21} /></div>
          <p className="result-explanation">{result.result.explanation}</p>
          <div className="insight-list">{result.result.insights.map((insight) => <div key={insight}><AlertTriangle size={15} /><span>{insight}</span></div>)}</div>
          {result.result.correlations?.length > 0 && <div className="relationship-grid">{result.result.correlations.map((item) => <div key={`${item.a}-${item.b}`}><span>{item.a} ↔ {item.b}</span><strong>{item.value}</strong><i style={{ width: `${Math.min(100, Math.abs(item.value) * 100)}%` }} /></div>)}</div>}
          {result.result.counts && <div className="cluster-grid">{result.result.counts.map((count, index) => <div key={index}><span>Perfil {index + 1}</span><strong>{count}</strong><small>registros</small></div>)}</div>}
          {result.result.anomalies && <div className="anomaly-list">{result.result.anomalies.map((item) => <div key={item.row}><span>Fila {item.row}</span><strong>{item.score}</strong></div>)}</div>}
          {result.result.metrics && <div className="model-metrics">{result.result.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>}
          {result.result.predictions && <div className="prediction-table"><div><span>Real</span><span>Estimado</span></div>{result.result.predictions.map((prediction, index) => <div key={index}><strong>{prediction.actual}</strong><strong>{prediction.predicted}</strong></div>)}</div>}
          <details className="r-output"><summary>Ver código R reproducible</summary><pre><code>{result.codeR}</code></pre></details>
        </div>
      )}
    </section>
  )
}

function TopicAnalysis({ tema }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })
  useEffect(() => {
    const clean = tema.trim()
    if (clean.length < 3) { setState({ status: 'idle', data: null, error: '' }); return undefined }
    setState({ status: 'loading', data: null, error: '' })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState({ status: 'loading', data: null, error: '' })
      try {
        const response = await fetch('/api/topic-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tema: clean }), signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `Backend ${response.status}`)
        setState({ status: 'ready', data, error: '' })
      } catch (error) {
        if (error.name !== 'AbortError') setState({ status: 'error', data: null, error: String(error.message || error) })
      }
    }, 650)
    return () => { clearTimeout(timer); controller.abort() }
  }, [tema])

  if (state.status === 'loading') return <div className="topic-mining loading"><LoaderCircle className="loading-spinner" size={16} /><span>Buscando un corpus sobre “{tema.trim()}” y extrayendo patrones…</span></div>
  if (state.status === 'error') return <div className="topic-mining-error">No fue posible minar este tema ahora: {state.error}</div>
  if (!state.data) return null
  return <EvidenceExplorer key={state.data.tema} data={state.data} />
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function buildPreviewHtml(inv) {
  const list = (items = []) => (Array.isArray(items) ? items : [items]).map(formatReportItem).filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No registrado.</li>'
  const refs = (inv.referencias || []).slice(0, 10).map((reference) => reference.raw ? `<li>${escapeHtml(reference.titulo)}</li>` : `<li><strong>${escapeHtml(reference.titulo)}</strong><br>${escapeHtml(reference.autores)} (${reference.anio || 's. f.'}) · ${escapeHtml(reference.fuente || 'OpenAlex')} · ${reference.puntaje ?? 'n/a'}/100 · ${escapeHtml(reference.decision || 'sin clasificar')}</li>`).join('') || '<li>No se registraron referencias.</li>'
  const pipeline = typeof inv.pipeline === 'string' ? inv.pipeline : inv.pipeline ? `Recibidos: ${inv.pipeline.recibidos || 0} · únicos: ${inv.pipeline.unicos || 0} · confiables: ${inv.pipeline.confiables || 0} · seleccionados: ${inv.pipeline.top5 || 0}` : 'No disponible'
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#19302d;max-width:760px;margin:0 auto;padding:42px;line-height:1.55}h1{font-size:28px;margin-bottom:4px}h2{margin-top:28px;color:#2f6e5b;border-bottom:1px solid #d9dfd5;padding-bottom:5px}h3{margin-bottom:5px}small,.meta{color:#71827a}pre{background:#182b29;color:#dce9d8;padding:16px;white-space:pre-wrap;border-radius:4px}li{margin:7px 0}</style></head><body><p class="meta">INFORME DE MINERÍA DE DATOS · ${escapeHtml(inv.fecha || '')}</p><h1>${escapeHtml(inv.tema)}</h1><p class="meta">${escapeHtml(inv.metodo || 'Análisis automático')}</p><h2>Ficha y trazabilidad</h2><p>${escapeHtml(pipeline)}</p><h2>Alcance y desambiguación</h2><p>${escapeHtml(inv.alcance || 'No registrado.')}</p><h2>Definición</h2><p>${escapeHtml(inv.definicion)}</p><h2>Aplicaciones y oportunidades</h2><ul>${list(inv.oportunidades)}</ul><h2>Hallazgos principales</h2><ul>${list(inv.hallazgosPrincipales)}</ul><h2>Conceptos clave</h2><p>${escapeHtml(inv.conceptosInterpretacion || 'No registrados.')}</p><h2>Limitaciones</h2><ul>${list(inv.limitaciones)}</ul><h2>Conclusiones y recomendaciones</h2><ul>${list(inv.conclusiones)}</ul><h2>Ejemplo en R</h2><h3>${escapeHtml(inv.ejemploR?.descripcion || '')}</h3><pre>${escapeHtml(inv.ejemploR?.codigo || '')}</pre><h2>Referencias</h2><ol>${refs}</ol><h2>Auditoría editorial</h2><ul>${list(inv.auditoria)}</ul><h2>Registro de cambios</h2><ul>${list(inv.registroCambios)}</ul><h2>Datos faltantes</h2><ul>${list(inv.datosFaltantes)}</ul><h2>Nota metodológica</h2><p>${escapeHtml(inv.nota || 'Verifique los textos completos antes de tomar decisiones.')}</p></body></html>`
}

function PreviewModal({ investigation, onClose }) {
  const frameRef = useRef(null)
  const syncPreviewTheme = () => {
    const frame = frameRef.current
    const shell = frame?.closest('.app-shell')
    const doc = frame?.contentDocument
    if (!shell || !doc?.head) return
    let style = doc.getElementById('preview-screen-theme')
    if (!style) {
      style = doc.createElement('style')
      style.id = 'preview-screen-theme'
      doc.head.appendChild(style)
    }
    if (!shell.classList.contains('retro-mode')) {
      style.textContent = ''
      return
    }
    const palette = getComputedStyle(shell)
    const color = (name, fallback) => palette.getPropertyValue(name).trim() || fallback
    // The iframe is a separate document: copy the active palette for screen
    // only so printing continues to use the document's paper-friendly styles.
    style.textContent = `@media screen {
      html { color-scheme: dark; background: ${color('--retro-deep', '#071b1b')}; }
      body { color: ${color('--retro-text', '#d8f4d4')}; background: ${color('--retro-surface', '#0d2725')}; font-family: ${palette.fontFamily}; overflow-wrap: anywhere; }
      h1, h2, h3 { font-family: 'Courier New', monospace; }
      h1 { color: ${color('--retro-text', '#d8f4d4')}; }
      h2 { color: ${color('--green', '#6fe08e')}; border-color: ${color('--retro-line', '#23524a')}; }
      small, .meta { color: ${color('--retro-muted', '#c5e4cc')}; }
      pre { color: ${color('--retro-text', '#d8f4d4')}; background: ${color('--retro-deep', '#071b1b')}; border: 1px solid ${color('--retro-line', '#23524a')}; border-radius: 0; }
    }`
  }
  useEffect(syncPreviewTheme)
  return (
    <div className="preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <header><div><span className="micro-label">Vista previa del informe</span><h2 id="preview-title">{investigation.tema}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar vista previa">×</button></header>
        <div className="preview-toolbar"><span>Documento guardado · vista preparada para PDF</span><button type="button" onClick={() => document.querySelector('.preview-modal iframe')?.contentWindow?.print()}>Imprimir / guardar PDF</button></div>
        <iframe ref={frameRef} onLoad={syncPreviewTheme} title="Vista previa del informe" srcDoc={buildPreviewHtml(investigation)} />
      </section>
    </div>
  )
}

function BackendResults({ tema }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })
  useEffect(() => {
    const t = tema.trim()
    if (t.length < 3) return
    const ctrl = new AbortController()
    setState({ status: 'loading', data: null, error: '' })
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(t)}`, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`Backend ${res.status}`)
        const data = await res.json()
        setState({ status: 'ok', data, error: '' })
      } catch (e) {
        if (e.name !== 'AbortError') setState({ status: 'offline', data: null, error: String(e.message || e) })
      }
    }, 400)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [tema])

  if (state.status === 'loading') return <p className="backend-status">Buscando en OpenAlex con tu criterio 80/100…</p>
  if (state.status === 'offline') return <p className="backend-status">Backend apagado ({state.error}). Usa el método manual de abajo. Inicia con <code>npm run server</code>.</p>
  if (state.status !== 'ok' || !state.data) return null
  const top = state.data.resultados.slice(0, 5)
  return (
    <div className="backend-results">
      <div className="search-result-heading"><span>Backend · OpenAlex {state.data.fecha}</span><span>{state.data.total}</span></div>
      {top.map((r, i) => (
        <div className="backend-item" key={`${r.doi}-${i}`}>
          <div className="backend-item-head">
            <strong>{r.titulo}</strong>
            <span className={`score-badge ${r.decision}`}>{r.puntaje} · {r.decision}</span>
          </div>
          <small>{r.autores} · {r.anio} · {r.fuente} · {r.citas} citas</small>
          {r.resumen && <p>{r.resumen}…</p>}
          <a href={r.url} target="_blank" rel="noreferrer">Ver fuente <ArrowUpRight size={12} /></a>
        </div>
      ))}
      <div className="assist-actions">
        <button
          type="button"
          onClick={() => downloadText(
            `resultados_${tema.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.md`,
            `# Resultados backend: ${tema}\n\nFecha: ${state.data.fecha} · Fuente: OpenAlex\n\n${state.data.resultados.slice(0, 10).map((r) => `- **${r.titulo}** (${r.anio}) — ${r.autores}. ${r.fuente}. Citas: ${r.citas}. **${r.puntaje}/100 ${r.decision}**. ${r.url}`).join('\n')}\n`,
          )}
        >
          Descargar resultados .md
        </button>
      </div>
    </div>
  )
}

function Investigator({ tema, onSaved }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })
  const [modo, setModo] = useState('openrouter')
  const [save, setSave] = useState({ status: 'idle', info: '', error: '' })
  const [previewOpen, setPreviewOpen] = useState(false)
  async function run() {
    const t = tema.trim()
    if (t.length < 3) return
    setState({ status: 'loading', data: null, error: '' })
    setSave({ status: 'idle', info: '', error: '' })
    const ctrl = new AbortController()
    const limite = modo === 'openrouter' ? 240000 : 60000
    const timer = setTimeout(() => ctrl.abort(), limite)
    try {
      const res = await fetch('/api/investigar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: t, modo }),
        signal: ctrl.signal,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Backend ${res.status}`)
      setState({ status: 'ok', data, error: '' })
    } catch (e) {
      setState({ status: 'error', data: null, error: e.name === 'AbortError' ? `Tardó más de ${limite / 60000} min (modelo gratuito lento o saturado). Reintenta.` : String(e.message || e) })
    } finally {
      clearTimeout(timer)
    }
  }
  async function saveLatex() {
    if (!state.data) return
    setSave({ status: 'saving', info: '', error: '' })
    try {
      const res = await fetch('/api/guardar-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigacion: state.data }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Backend ${res.status}`)
       setSave({ status: 'ok', info: `${data.filename} → ${data.bucket}/${data.path}`, error: '' })
       window.dispatchEvent(new CustomEvent('buscadordocs-action', { detail: { type: 'save', topic: state.data.tema, filename: data.filename } }))
       onSaved?.()
    } catch (e) {
      setSave({ status: 'error', info: '', error: String(e.message || e) })
    }
  }
  return (
    <div className="investigator">
      <div className="investigator-bar">
        <div>
          <strong>Crea el informe del tema</strong>
          <small>{modo === 'openrouter' ? 'Informe en español con IA y documentos recuperados' : 'Análisis local de los documentos recuperados'}</small>
        </div>
        <span>
          <select aria-label="Tipo de informe" value={modo} onChange={(e) => setModo(e.target.value)} disabled={state.status === 'loading'}>
            <option value="local">Análisis local</option>
            <option value="openrouter">OpenRouter (gratis)</option>
          </select>
          <button type="button" onClick={run} disabled={state.status === 'loading'} aria-busy={state.status === 'loading'}>
            {state.status === 'loading' ? 'Generando informe…' : state.status === 'ok' ? 'Volver a generar' : 'Generar informe'}
          </button>
        </span>
      </div>
      {state.status === 'loading' && (
        <div className="investigator-loading" role="status" aria-live="polite">
          <LoaderCircle className="loading-spinner" size={15} aria-hidden="true" />
          <span>Investigando “{tema.trim()}” en docs + OpenAlex</span>
          <span className="loading-dots" aria-hidden="true">...</span>
        </div>
      )}
      {state.status === 'error' && <p className="backend-status" role="alert">Error: {state.error}</p>}
      {state.status === 'ok' && state.data && (
        <div className="structured">
          <ReportReader report={state.data} />
          <div className="assist-actions">
                <button
                  type="button"
                  onClick={() => downloadText(
                    `investigacion_${tema.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.md`,
                    `# Investigación: ${state.data.tema}\n\nFecha: ${state.data.fecha} · Modo: ${state.data.modo}\nMétodo: ${state.data.metodo}\n\n## Definición\n\n${state.data.definicion}\n\n## Oportunidades\n\n${state.data.oportunidades.map((o) => `- ${o}`).join('\n')}\n\n## Ejemplo en R (${state.data.ejemploR.descripcion})\n\n\`\`\`r\n${state.data.ejemploR.codigo}\n\`\`\`\n\n## Referencias\n\n${state.data.referencias.map((r) => `- **${r.titulo}** (${r.anio}) — ${r.autores}. **${r.puntaje}/100 ${r.decision}**. ${r.url}\n\n  \`\`\`bibtex\n  ${r.bibtex}\n  \`\`\``).join('\n')}\n\n## Nota\n\n${state.data.nota}\n`,
                  )}
                >
                  Descargar Markdown
                </button>
                <button type="button" onClick={() => setPreviewOpen(true)} disabled={!state.data}>
                  Previsualizar
                </button>
                <button type="button" onClick={saveLatex} disabled={save.status === 'saving'}>
                  {save.status === 'saving' ? 'Guardando…' : 'Guardar informe'}
                </button>
              </div>
              {save.status === 'ok' && <p className="research-save-status" role="status">✓ Informe guardado en tu biblioteca.</p>}
              {save.status === 'error' && <p className="backend-status" role="alert">No se pudo guardar: {save.error}</p>}
          </div>
       )}
       {previewOpen && state.data && <PreviewModal investigation={state.data} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

function renderChatMessage(content) {
  return content.split(/(```(?:r|R)?[\s\S]*?```)/g).filter(Boolean).map((chunk, index) => {
    const code = chunk.match(/^```(?:r|R)?\s*([\s\S]*?)```$/)
    return code ? <pre className="chat-code" key={index}><code>{code[1].trim()}</code></pre> : <p key={index}>{chunk}</p>
  })
}

function Dashboard({ topic }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })
  useEffect(() => {
    if (!topic?.title) return undefined
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: '' })
    fetch('/api/topic-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tema: topic.title }), signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || `Backend ${response.status}`); return data })
      .then((data) => setState({ status: 'ready', data, error: '' }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ status: 'error', data: null, error: String(error.message || error) }) })
    return () => controller.abort()
  }, [topic?.title])

  if (!topic) return <section className="dashboard-view"><div className="dashboard-empty"><BarChart3 size={24} /><h2>Selecciona un tema</h2><p>El dashboard necesita un tema de la biblioteca para construir su corpus.</p></div></section>
  if (state.status === 'loading') return <section className="dashboard-view"><div className="section-heading"><div><span className="eyebrow">Mapa de evidencia</span><h2>Dashboard · {topic.title}</h2></div></div><div className="dashboard-loading"><LoaderCircle className="loading-spinner" size={18} /> Construyendo indicadores del corpus...</div></section>
  if (state.status === 'error') return <section className="dashboard-view"><div className="dashboard-error"><AlertTriangle size={20} /><strong>No se pudo construir el dashboard</strong><p>{state.error}</p><small>Comprueba la conexión con OpenAlex y vuelve a intentarlo.</small></div></section>
  const data = state.data
  const maxYear = Math.max(...(data.years || []).map((item) => item.count), 1)
  const corpus = data.dataset || []
  const scored = corpus.map((item) => Number(item.puntaje)).filter(Number.isFinite)
  const averageScore = scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null
  const sourceCount = new Set(corpus.map((item) => item.fuente).filter(Boolean)).size
  const abstractCoverage = corpus.length ? Math.round(corpus.filter((item) => String(item.resumen || '').trim().length > 40).length / corpus.length * 100) : 0
  const confidence = corpus.length >= 5 && sourceCount >= 3 && (averageScore == null || averageScore >= 75)
    ? { label: 'Respaldo amplio', level: 'strong', reason: 'La muestra tiene varios documentos y fuentes; esto mide cobertura del corpus, no calidad definitiva de cada estudio.' }
    : corpus.length >= 2 && sourceCount >= 2
      ? { label: 'Respaldo parcial', level: 'partial', reason: 'Hay más de una fuente, pero la muestra o su diversidad todavía es limitada.' }
      : corpus.length
        ? { label: 'Evidencia limitada', level: 'limited', reason: 'La cantidad o diversidad de documentos no permite sostener un patrón robusto.' }
        : { label: 'Sin evidencia recuperada', level: 'none', reason: 'No se recuperaron documentos para construir una cadena de respaldo.' }
  const traceItems = (data.keywords || []).slice(0, 6).map((keyword) => {
    const term = normalizeHeading(keyword.word || '')
    const matches = corpus.filter((document) => normalizeHeading(`${document.titulo || ''} ${document.resumen || ''}`).includes(term))
    return { ...keyword, documents: matches }
  })
  return (
    <section className="dashboard-view" aria-labelledby="dashboard-title">
      <div className="section-heading"><div><span className="eyebrow">Mapa de evidencia</span><h2 id="dashboard-title">Dashboard · {topic.title}</h2></div><p>Una lectura rápida del corpus recuperado: volumen, términos, trayectoria y fuentes.</p></div>
      <div className="dashboard-signal"><div><span className="micro-label">Lectura del corpus</span><strong>{data.insights?.[0] || 'Sin resumen disponible.'}</strong></div><BarChart3 size={28} /></div>
      <div className="dashboard-metrics"><div><span>Documentos</span><strong>{data.profile?.rows || 0}</strong><small>seleccionados</small></div><div><span>Fuentes</span><strong>{new Set((data.dataset || []).map((item) => item.fuente)).size}</strong><small>representadas</small></div><div><span>Años</span><strong>{data.years?.length || 0}</strong><small>con cobertura</small></div><div><span>Palabras clave</span><strong>{data.keywords?.length || 0}</strong><small>extraídas</small></div></div>
      <section className={`evidence-confidence confidence-${confidence.level}`} aria-labelledby="confidence-title"><div className="confidence-summary"><span className="confidence-symbol"><CheckCircle2 size={20} /></span><div><span className="micro-label">Semáforo del corpus</span><h3 id="confidence-title">{confidence.label}</h3><p>{confidence.reason}</p></div></div><div className="confidence-stats"><div><strong>{corpus.length}</strong><span>documentos</span></div><div><strong>{sourceCount}</strong><span>fuentes</span></div><div><strong>{averageScore == null ? '—' : `${averageScore}/100`}</strong><span>puntaje medio de recuperación</span></div><div><strong>{abstractCoverage}%</strong><span>resúmenes disponibles</span></div></div><details className="confidence-method"><summary>¿Cómo se calcula?</summary><p>Es una señal orientativa con cantidad de documentos recuperados, diversidad de fuentes y puntaje medio de coincidencia cuando está disponible. No evalúa por sí sola revisión por pares, sesgo, validez ni causalidad; confirma los textos completos antes de concluir.</p></details></section>
      <div className="dashboard-grid"><article className="dashboard-card dashboard-terms"><div className="dashboard-card-heading"><span className="micro-label">Señales del corpus</span><strong>Términos frecuentes</strong></div><div className="keyword-cloud">{data.keywords?.length ? data.keywords.map((item) => <span key={item.word}>{item.word}<small>{item.count}</small></span>) : <em>No hay resúmenes suficientes.</em>}</div></article><article className="dashboard-card"><div className="dashboard-card-heading"><span className="micro-label">Cobertura temporal</span><strong>Evolución documental</strong></div><div className="dashboard-years">{data.years?.length ? data.years.map((item) => <div key={item.year}><span style={{ height: `${Math.max(10, (item.count / maxYear) * 110)}px` }}>{item.count}</span><small>{item.year}</small></div>) : <em>Sin años disponibles.</em>}</div></article></div>
      <div className="dashboard-grid"><article className="dashboard-card"><div className="dashboard-card-heading"><span className="micro-label">Distribución</span><strong>Fuentes principales</strong></div><div className="dashboard-list">{[...new Map((data.dataset || []).map((item) => [item.fuente, (data.dataset || []).filter((row) => row.fuente === item.fuente).length])).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([source, count]) => <div key={source}><span>{source}</span><b>{count}</b></div>)}</div></article><article className="dashboard-card"><div className="dashboard-card-heading"><span className="micro-label">Evidencia priorizada</span><strong>Documentos destacados</strong></div><div className="dashboard-documents">{data.dataset?.slice(0, 5).map((item) => <div key={item.titulo}><strong>{item.titulo}</strong><small>{item.anio} · {item.citas || 0} citas · {item.puntaje || 0}/100</small></div>)}</div></article></div>
      <section className="evidence-chain" aria-labelledby="evidence-chain-title"><div className="evidence-chain-heading"><div><span className="micro-label">Trazabilidad</span><h3 id="evidence-chain-title">De los términos a sus documentos</h3><p>Relación directa entre señales léxicas del corpus y los registros donde aparecen. No equivale a validar un hallazgo causal.</p></div><span>{traceItems.length} señales rastreadas</span></div>{traceItems.length ? <div className="evidence-chain-list">{traceItems.map((item) => <details className="evidence-chain-item" key={item.word}><summary><span className="chain-term">{item.word}<small>{item.count} apariciones</small></span><span className="chain-connect" aria-hidden="true" /><span className="chain-support">{item.documents.length} {item.documents.length === 1 ? 'documento' : 'documentos'}</span><ChevronRight size={15} /></summary><div className="chain-documents">{item.documents.length ? item.documents.map((document) => <article key={`${item.word}-${document.titulo}`}><strong>{document.titulo}</strong><small>{[document.autores, document.anio, document.fuente].filter(Boolean).join(' · ')}</small>{document.resumen && <p>{document.resumen.slice(0, 300)}{document.resumen.length > 300 ? '…' : ''}</p>}{document.doi && <a href={/^https?:\/\//i.test(document.doi) ? document.doi : `https://doi.org/${document.doi.replace(/^doi:/i, '')}`} target="_blank" rel="noreferrer">Abrir fuente <ArrowUpRight size={12} /></a>}</article>) : <p className="chain-no-match">No se encontró coincidencia del término en títulos o resúmenes recuperados; la frecuencia puede proceder de texto normalizado u otro campo.</p>}</div></details>)}</div> : <p className="chain-no-match">No hay términos disponibles para trazar en esta muestra.</p>}</section>
    </section>
  )
}

function AtlasView({ topic, relatedTopics = [], onSelectTopic }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })
  useEffect(() => {
    if (!topic?.title) return undefined
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: '' })
    fetch('/api/topic-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tema: topic.title }), signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || `Backend ${response.status}`); return data })
      .then((data) => setState({ status: 'ready', data, error: '' }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ status: 'error', data: null, error: String(error.message || error) }) })
    return () => controller.abort()
  }, [topic?.title])

  if (!topic) return <section className="atlas-view"><div className="dashboard-empty"><Network size={24} /><h2>Selecciona un tema</h2><p>El Atlas necesita un tema para construir su red de evidencia.</p></div></section>
  if (state.status === 'loading') return <section className="atlas-view"><div className="section-heading"><div><span className="eyebrow">Sección 03</span><h2>Atlas · {topic.title}</h2></div></div><div className="dashboard-loading"><LoaderCircle className="loading-spinner" size={18} /> Construyendo la red de evidencia...</div></section>
  if (state.status === 'error') return <section className="atlas-view"><div className="dashboard-error"><AlertTriangle size={20} /><strong>No se pudo construir el Atlas</strong><p>{state.error}</p><small>Comprueba la conexión con OpenAlex y vuelve a intentarlo.</small></div></section>
  return <section className="atlas-view" aria-labelledby="atlas-view-title"><div className="section-heading"><div><span className="eyebrow">Sección 03 · exploración visual</span><h2 id="atlas-view-title">Atlas de evidencia</h2></div><p>Explora las relaciones entre “{topic.title}”, sus documentos y los conceptos que aparecen en el corpus.</p></div><EvidenceAtlas data={state.data} />{relatedTopics.length > 0 && <section className="atlas-related" aria-labelledby="atlas-related-title"><div><span className="micro-label">Continuidad del mapa</span><h3 id="atlas-related-title">Temas que comparten territorio</h3><p>Se relacionan por área, etiquetas y vocabulario. Selecciona uno para reconstruir su evidencia.</p></div><div className="atlas-related-list">{relatedTopics.map((related) => <button type="button" key={related.id} onClick={() => onSelectTopic?.(related)}><span className="atlas-related-mark"><Network size={15} /></span><span><strong>{related.title}</strong><small>{(related.categories || []).slice(0, 2).join(' · ') || 'Tema relacionado'}</small></span><ArrowUpRight size={15} /></button>)}</div></section>}</section>
}

function EvidenceRoute({ topic, progress, onNavigate }) {
  const [diary, setDiary] = useState(() => {
    try { const entries = JSON.parse(localStorage.getItem('buscadordocs-diary') || '[]'); return Array.isArray(entries) ? entries : [] } catch { return [] }
  })
  const [question, setQuestion] = useState(() => localStorage.getItem('buscadordocs-active-question') || '')
  const [plan, setPlan] = useState(() => {
    try { return JSON.parse(localStorage.getItem('buscadordocs-research-plan') || 'null') } catch { return null }
  })
  const [caseType, setCaseType] = useState('general')
  const missions = [
    { id: 'searches', title: 'Explora un tema', detail: 'Registra una búsqueda y revisa qué evidencia aparece.', section: 'library', current: progress.searches, action: 'Abrir biblioteca', icon: Search },
    { id: 'dataset', title: 'Prepara los datos', detail: 'Carga un CSV o crea un conjunto de prueba relacionado.', section: 'lab', current: progress.datasets, action: 'Ir al laboratorio', icon: Database },
    { id: 'analysis', title: 'Ejecuta un análisis', detail: 'Prueba un método y observa sus resultados y límites.', section: 'lab', current: progress.analyses, action: 'Analizar datos', icon: BarChart3 },
    { id: 'rRuns', title: 'Reproduce en R', detail: 'Ejecuta un ejemplo y conserva el resultado reproducible.', section: 'lab', current: progress.rRuns, action: 'Abrir ejemplos R', icon: Braces },
    { id: 'reports', title: 'Documenta el hallazgo', detail: 'Guarda un informe para dejar trazabilidad del trabajo.', section: 'library', current: progress.reports, action: 'Ver informes', icon: CircleCheck },
  ]
  const completedMissions = missions.filter((mission) => mission.current > 0).length

  useEffect(() => {
    const onDiary = (event) => setDiary(Array.isArray(event.detail) ? event.detail : [])
    window.addEventListener('buscadordocs-diary', onDiary)
    return () => window.removeEventListener('buscadordocs-diary', onDiary)
  }, [])

  function exportDiary() {
    const rows = diary.map((entry) => `- ${new Date(entry.at).toLocaleString('es-CO')} · **${entry.title}**${entry.detail ? ` · ${entry.detail}` : ''}`).join('\n')
    downloadText('bitacora-investigacion.md', `# Bitácora de investigación\n\nTema activo: ${topic?.title || 'No especificado'}\n\nRegistro local exportado el ${new Date().toLocaleString('es-CO')}.\n\n${rows || 'Aún no hay actividades registradas.'}\n\n> La bitácora conserva metadatos de actividad; no guarda contenidos de archivos ni el código ejecutado.\n`)
  }

  function generatePlan(event) {
    event.preventDefault()
    const text = question.trim()
    if (!text) return
    const normalized = normalizeHeading(text)
    const method = /segment|perfil|grupo|cliente/.test(normalized) ? 'cluster'
      : /predec|estimar|precio|venta|ingreso|cantidad|tiempo/.test(normalized) ? 'regression'
      : /anomalia|atipic|fraude|error/.test(normalized) ? 'anomaly'
      : /clasific|riesgo|abandono|categoria|categor/.test(normalized) ? 'classification'
      : /texto|document|resumen|opinion|comentario/.test(normalized) ? 'text-mining' : 'explore'
    const methodLabels = { cluster: 'Segmentación (clustering)', regression: 'Regresión', classification: 'Clasificación', anomaly: 'Detección de anomalías', 'text-mining': 'Minería de texto', explore: 'Exploración descriptiva' }
    const metricLabels = { cluster: 'silhouette y tamaño de grupos', regression: 'MAE o RMSE en datos de prueba', classification: 'F1 y matriz de confusión', anomaly: 'revisión de falsos positivos y casos señalados', 'text-mining': 'cobertura del corpus y términos por documento', explore: 'distribución, datos faltantes y relaciones entre variables' }
    const contextualVars = caseType === 'salud' ? 'edad, diagnóstico, tratamiento y resultado clínico' : caseType === 'educacion' ? 'asistencia, actividad, evaluación y resultado académico' : caseType === 'comercio' ? 'fecha, producto, monto, frecuencia y segmento' : caseType === 'finanzas' ? 'fecha, monto, historial, categoría y resultado de riesgo' : 'fecha, identificador, variables de contexto y resultado observado'
    const nextPlan = { question: text, method, methodLabel: methodLabels[method], variables: contextualVars, metric: metricLabels[method], caseType, caution: 'Confirma que las variables existan en el dataset, evita fuga de información y separa datos de entrenamiento y prueba. Si el CSV es sintético, interpreta el resultado solo como demostración.' }
    setPlan(nextPlan)
    localStorage.setItem('buscadordocs-active-question', text)
    localStorage.setItem('buscadordocs-research-plan', JSON.stringify(nextPlan))
  }

  const hasTopic = Boolean(topic)
  const steps = [
    { id: 'question', label: 'Pregunta', detail: hasTopic ? `Explorar “${topic.title}”` : 'Elige un tema para comenzar', section: 'library', icon: Search, done: hasTopic },
    { id: 'sources', label: 'Fuentes', detail: hasTopic ? 'Documentos y referencias recuperadas' : 'Aún no hay evidencia', section: 'library', icon: BookOpen, done: hasTopic },
    { id: 'concepts', label: 'Conceptos', detail: hasTopic ? 'Términos, áreas y relaciones' : 'Se construyen desde las fuentes', section: 'atlas', icon: Network, done: progress.atlas > 0 },
    { id: 'data', label: 'Datos', detail: 'Crear o cargar un dataset para probar', section: 'lab', icon: Database, done: progress.datasets > 0 },
    { id: 'model', label: 'Modelo', detail: 'Ejecutar un método y medir el resultado', section: 'lab', icon: Braces, done: progress.analyses > 0 || progress.rRuns > 0 },
    { id: 'finding', label: 'Hallazgo', detail: 'Leer señales, métricas y límites', section: 'dashboard', icon: BarChart3, done: progress.analyses > 0 },
    { id: 'report', label: 'Informe', detail: 'Guardar una ruta reproducible', section: 'library', icon: CircleCheck, done: Boolean(topic?.saved) || progress.reports > 0 },
  ]
  const completed = steps.filter((step) => step.done).length
  const nextStep = steps.find((step) => !step.done) || steps.at(-1)
  return <section className="evidence-route" aria-labelledby="route-title">
    <div className="route-hero">
      <div><span className="eyebrow"><Route size={13} /> Ruta de evidencia</span><h2 id="route-title">Investiga sin perder el hilo.</h2><p>Convierte una pregunta en fuentes, datos, modelos y una conclusión que puedas defender. Puedes entrar por cualquier etapa y volver cuando quieras.</p></div>
      <div className="route-score"><strong>{completed}/{steps.length}</strong><span>etapas conectadas</span><i><b style={{ width: `${completed / steps.length * 100}%` }} /></i></div>
    </div>
    <div className="route-context"><span className="micro-label">Tema activo</span><strong>{topic?.title || 'Selecciona un tema en la biblioteca'}</strong><span>{topic?.categories?.slice(0, 2).join(' · ') || 'La ruta se adapta a tu investigación'}</span></div>
    <div className="route-map" aria-label="Etapas de la ruta de evidencia">
      {steps.map((step, index) => { const Icon = step.icon; return <div className="route-step-wrap" key={step.id}><button type="button" className={`route-step ${step.done ? 'done' : ''} ${nextStep.id === step.id ? 'next' : ''}`} onClick={() => onNavigate(step.section)}><span className="route-step-icon"><Icon size={17} /><small>{String(index + 1).padStart(2, '0')}</small></span><span><strong>{step.label}</strong><small>{step.detail}</small></span><ChevronRight size={15} /></button>{index < steps.length - 1 && <span className={`route-connector ${step.done ? 'done' : ''}`} aria-hidden="true" />}</div> })}
    </div>
    <section className="route-missions" aria-labelledby="route-missions-title">
      <div className="route-section-head"><div><span className="micro-label">Retos de investigación</span><h3 id="route-missions-title">Avanza con acciones reales</h3><p>{completedMissions} de {missions.length} hitos completados · se actualizan al usar el sistema.</p></div><span className="route-mission-count">{String(completedMissions).padStart(2, '0')} / {String(missions.length).padStart(2, '0')}</span></div>
      <div className="route-mission-grid">{missions.map((mission) => { const Icon = mission.icon; const done = mission.current > 0; return <article className={`route-mission ${done ? 'is-done' : ''}`} key={mission.id}><span className="route-mission-icon"><Icon size={17} /></span><div><strong>{mission.title}</strong><p>{mission.detail}</p><small>{done ? 'Completado' : 'Pendiente'}</small></div><button type="button" onClick={() => onNavigate(mission.section)}>{done ? 'Revisar' : mission.action}<ChevronRight size={14} /></button></article> })}</div>
    </section>
    <section className="route-planner" aria-labelledby="route-planner-title">
      <div className="route-planner-intro"><span className="micro-label">Diseña tu análisis</span><h3 id="route-planner-title">De una hipótesis a un plan comprobable.</h3><p>Describe qué quieres averiguar. La propuesta orienta el análisis; no sustituye la evidencia ni la revisión del dataset.</p>
        <form onSubmit={generatePlan} className="route-question-form"><label htmlFor="route-question">Pregunta o hipótesis</label><textarea id="route-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ej.: ¿Los clientes con más compras abandonan menos?" rows={3} /><div className="route-form-actions"><label>Contexto<select value={caseType} onChange={(event) => setCaseType(event.target.value)}><option value="general">General</option><option value="salud">Salud</option><option value="educacion">Educación</option><option value="comercio">Comercio</option><option value="finanzas">Finanzas</option></select></label><button type="submit" disabled={!question.trim()}><Sparkles size={15} /> Crear plan</button></div></form>
      </div>
      {plan ? <div className="route-plan-result"><div className="route-plan-status"><CheckCircle2 size={16} /><span>Plan de trabajo · sugerencia automática</span></div><h4>{plan.question}</h4><dl><div><dt>Análisis sugerido</dt><dd>{plan.methodLabel}</dd></div><div><dt>Variables candidatas</dt><dd>{plan.variables}</dd></div><div><dt>Cómo evaluar</dt><dd>{plan.metric}</dd></div></dl><p className="route-plan-caution"><AlertTriangle size={15} />{plan.caution}</p><button type="button" onClick={() => onNavigate('lab')}>Llevar al laboratorio <ArrowUpRight size={14} /></button></div> : <div className="route-plan-empty"><CircleHelp size={20} /><strong>Tu plan aparecerá aquí</strong><span>Incluye un método inicial, variables a buscar, una métrica y precauciones.</span></div>}
    </section>
    <section className="route-diary" aria-labelledby="route-diary-title"><div className="route-diary-head"><div><span className="micro-label">Memoria del proyecto · solo este navegador</span><h3 id="route-diary-title">Bitácora de investigación</h3><p>Un historial de acciones para recuperar el recorrido y exportarlo como Markdown. No almacena el contenido de tus archivos ni el código.</p></div><button type="button" onClick={exportDiary} disabled={!diary.length}><Upload size={14} /> Exportar .md</button></div>{diary.length ? <ol className="route-diary-list">{diary.slice(0, 8).map((entry) => <li key={entry.id}><time dateTime={entry.at}>{new Date(entry.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</time><strong>{entry.title}</strong>{entry.detail && <span>{entry.detail}</span>}</li>)}</ol> : <div className="route-diary-empty"><CircleHelp size={17} /><span>Cuando busques, cargues datos o ejecutes análisis, el recorrido aparecerá aquí.</span></div>}{diary.length > 8 && <small className="route-diary-foot">Mostrando las 8 actividades recientes de {diary.length}. El historial guarda hasta 100.</small>}</section>
    <div className="route-branches"><div><span className="micro-label">Puedes desviarte</span><h3>Elige otro camino</h3><p>El proceso no es una secuencia fija: puedes explorar, comparar y volver a la evidencia.</p></div><div className="route-branch-grid"><button type="button" onClick={() => onNavigate('atlas')}><Network size={16} /><span><strong>Seguir conexiones</strong><small>Descubre conceptos y temas relacionados.</small></span><ArrowUpRight size={14} /></button><button type="button" onClick={() => onNavigate('chat')}><MessageCircle size={16} /><span><strong>Preguntar al asistente</strong><small>Aclara un concepto o pide un ejemplo en R.</small></span><ArrowUpRight size={14} /></button></div></div>
  </section>
}

function BotAvatar({ status, onInteract }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const didDrag = useRef(false)

  function startDrag(event) {
    if (event.button !== 0) return
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, x: offset.x, y: offset.y }
    didDrag.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }

  function moveDrag(event) {
    if (!dragStart.current) return
    const x = dragStart.current.x + event.clientX - dragStart.current.pointerX
    const y = dragStart.current.y + event.clientY - dragStart.current.pointerY
    if (Math.abs(x - dragStart.current.x) > 4 || Math.abs(y - dragStart.current.y) > 4) didDrag.current = true
    setOffset({ x, y })
  }

  function stopDrag(event) {
    if (!dragStart.current) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragStart.current = null
    setDragging(false)
  }

  return (
    <button className={`assistant-avatar assistant-avatar-${status}`} type="button" onClick={onInteract} aria-label="Interactuar con el asistente de minería" title="Interactuar con el asistente">
      <span className="assistant-avatar-antenna" />
      <span className="assistant-avatar-node node-one" />
      <span className="assistant-avatar-node node-two" />
      <span className="assistant-avatar-face"><span className="assistant-avatar-eye" /><span className="assistant-avatar-eye" /><span className="assistant-avatar-mouth" /></span>
      <span className="assistant-avatar-hand hand-left">✦</span><span className="assistant-avatar-hand hand-right">✦</span>
      <span className="assistant-avatar-foot foot-left" /><span className="assistant-avatar-foot foot-right" />
      <span className="assistant-avatar-orbit orbit-one" /><span className="assistant-avatar-orbit orbit-two" />
    </button>
  )
}

function DraggableAvatar({ status, onInteract }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const didDrag = useRef(false)

  function startDrag(event) {
    if (event.button !== 0) return
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, x: offset.x, y: offset.y }
    didDrag.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }

  function moveDrag(event) {
    if (!dragStart.current) return
    const x = dragStart.current.x + event.clientX - dragStart.current.pointerX
    const y = dragStart.current.y + event.clientY - dragStart.current.pointerY
    if (Math.abs(x - dragStart.current.x) > 4 || Math.abs(y - dragStart.current.y) > 4) didDrag.current = true
    setOffset({ x, y })
  }

  function stopDrag(event) {
    if (!dragStart.current) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragStart.current = null
    setDragging(false)
  }

  return <div className={`assistant-avatar-dragger${dragging ? ' is-dragging' : ''}`} style={{ translate: `${offset.x}px ${offset.y}px` }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag}>
    <BotAvatar status={status} onInteract={() => { if (!didDrag.current) onInteract() }} />
  </div>
}

function MiningChatbot() {
  const [avatarMood, setAvatarMood] = useState('idle')

  function interactWithAvatar() {
    setAvatarMood('hello')
    window.setTimeout(() => setAvatarMood('idle'), 1200)
  }

  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Soy tu asistente de minería de datos. Pregúntame por conceptos, métodos, métricas o ejemplos en R.' }])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  async function sendMessage(event) {
    event.preventDefault()
    const message = input.trim()
    if (!message || status === 'loading') return
    const next = [...messages, { role: 'user', content: message }]
    setMessages(next); setInput(''); setError(''); setStatus('loading'); setAvatarMood('thinking')
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, history: messages.slice(-8) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Backend ${response.status}`)
      setMessages([...next, { role: 'assistant', content: data.answer }]); setStatus('idle'); setAvatarMood('success')
      window.setTimeout(() => setAvatarMood('idle'), 1600)
    } catch (e) { setStatus('error'); setError(String(e.message || e)); setAvatarMood('error') }
  }

  return (
    <section className="chat-view" aria-labelledby="chat-title">
      <div className="section-heading"><div><span className="eyebrow">Sección 02</span><h2 id="chat-title">Pregunta rápido.</h2></div><p>Una conversación breve para destrabar conceptos, métodos y código R.</p></div>
      <div className="chat-shell">
        <div className="chat-avatar-dock"><DraggableAvatar status={status === 'loading' ? 'thinking' : avatarMood} onInteract={interactWithAvatar} /></div>
        <div className="chat-header"><div className="chat-avatar"><MessageCircle size={18} /></div><div><strong>Asistente de minería</strong><span>Solo minería de datos · responde en español</span></div><span className="chat-live">EN LÍNEA</span></div>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message, index) => <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="chat-role">{message.role === 'assistant' ? 'ASISTENTE' : 'TÚ'}</span><div>{renderChatMessage(message.content)}</div>{message.role === 'assistant' && index > 0 && <button className="chat-copy" type="button" onClick={() => navigator.clipboard?.writeText(message.content)}><Copy size={13} /> Copiar</button>}</article>)}
          {status === 'loading' && <article className="chat-message assistant"><span className="chat-role">ASISTENTE</span><p className="chat-thinking">Analizando<span>...</span></p></article>}
        </div>
        <form className="chat-composer" onSubmit={sendMessage}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ej.: ¿Qué diferencia hay entre clasificación y clustering?" rows="2" aria-label="Pregunta de minería de datos" /><button type="submit" disabled={!input.trim() || status === 'loading'} aria-label="Enviar pregunta"><Send size={17} /></button></form>
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="chat-suggestions"><button type="button" onClick={() => setInput('Dame un ejemplo en R de clasificación con datos sintéticos')}>Ejemplo en R</button><button type="button" onClick={() => setInput('¿Qué métrica uso para evaluar un modelo de clasificación?')}>Métricas</button><button type="button" onClick={() => setInput('Explícame CRISP-DM en pocas palabras')}>CRISP-DM</button></div>
      </div>
    </section>
  )
}

function topicSimilarity(source, candidate) {
  const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const sourceWords = new Set(normalize(`${source.title} ${(source.categories || []).join(' ')} ${(source.tags || []).join(' ')}`).split(/\W+/).filter((word) => word.length > 3))
  const candidateWords = normalize(`${candidate.title} ${(candidate.categories || []).join(' ')} ${(candidate.tags || []).join(' ')}`).split(/\W+/).filter((word) => word.length > 3)
  const sharedWords = candidateWords.filter((word) => sourceWords.has(word)).length
  const sharedAreas = (source.categories || []).filter((category) => (candidate.categories || []).includes(category)).length
  return sharedAreas * 5 + sharedWords
}

function App() {
  const [activeId, setActiveId] = useState(topics[0]?.id)
  const [activeSection, setActiveSection] = useState('home')
  const [retroMode, setRetroMode] = useState(() => localStorage.getItem('buscadordocs-retro') === 'on')
  const [soundMode, setSoundMode] = useState(() => localStorage.getItem('buscadordocs-sound') === 'on')
  const [progress, setProgress] = useState(readProgress)
  const [palette, setPalette] = useState(() => localStorage.getItem('buscadordocs-palette') || 'green')
  const [motionMode, setMotionMode] = useState(() => localStorage.getItem('buscadordocs-motion') || 'full')
  const [density, setDensity] = useState(() => localStorage.getItem('buscadordocs-density') || 'comfortable')
  const [customizationOpen, setCustomizationOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchCounts, setSearchCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('buscadordocs-search-counts') || '{}') } catch { return {} }
  })
  const [openCategories, setOpenCategories] = useState([])
  const [savedTopics, setSavedTopics] = useState([])
  const [savedPreviewOpen, setSavedPreviewOpen] = useState(false)
  const allTopics = [...topics, ...savedTopics]
  const activeTopic = allTopics.find((topic) => topic.id === activeId) ?? allTopics[0]
  const relatedTopics = activeTopic
    ? allTopics.filter((topic) => topic.id !== activeTopic.id).map((topic) => ({ topic, score: topicSimilarity(activeTopic, topic) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(({ topic }) => topic)
    : []
  const availableCategories = [...new Set(allTopics.flatMap((topic) => topic.categories || []))].sort((a, b) => a.localeCompare(b))
  const categoryGroups = availableCategories.map((category) => ({
    category,
    topics: allTopics.filter((topic) => topic.categories?.includes(category)),
  }))
  const savedPreview = activeTopic?.saved ? {
    tema: activeTopic.title,
    ...(activeTopic.report || {
      fecha: '',
      metodo: 'Documento LaTeX guardado en Supabase',
      definicion: activeTopic.definition,
      oportunidades: [activeTopic.opportunity],
      hallazgosPrincipales: [],
      ejemploR: { descripcion: activeTopic.example, codigo: activeTopic.code },
      referencias: [],
      nota: 'Vista previa del documento guardado.',
    }),
  } : null
  const normalizeText = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const normalizedQuery = normalizeText(query).trim()
  const queryTerms = normalizedQuery.split(/\s+/).filter((term) => term.length > 1)
  const hasIncompleteQuery = normalizedQuery.length > 0 && queryTerms.length === 0
  const filteredTopics = normalizedQuery.length === 0
    ? allTopics
    : queryTerms.length > 0
    ? allTopics.filter((topic) => {
      const searchableText = normalizeText(`${topic.title} ${topic.short} ${topic.definition} ${topic.opportunity} ${topic.example} ${topic.tags.join(' ')} oportunidades ejemplos definición`)
      return queryTerms.every((term) => searchableText.includes(term))
    })
    : []
  const popularSearches = Object.entries(searchCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const popularMax = Math.max(...popularSearches.map(([, count]) => count), 1)
  const quickTopics = [...new Map(allTopics.map((topic) => [topic.title.toLowerCase(), topic])).values()].slice(0, 4)

  async function loadSavedTopics() {
    try {
      const res = await fetch('/api/temas-guardados')
      if (!res.ok) throw new Error(`Backend ${res.status}`)
      const { documents = [] } = await res.json()
      setSavedTopics(documents.map((document, index) => parseLatexTopic(document.source, document.path, topics.length + index, true)))
    } catch {
      setSavedTopics([])
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/temas-guardados')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`Backend ${res.status}`)))
      .then(({ documents = [] }) => {
        if (!cancelled) setSavedTopics(documents.map((document, index) => parseLatexTopic(document.source, document.path, topics.length + index, true)))
      })
      .catch(() => {
        if (!cancelled) setSavedTopics([])
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const nodes = document.querySelectorAll('[data-scroll-reveal]')
    if (!nodes.length || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'))
      return undefined
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target) }
    }), { threshold: 0.12 })
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [activeSection, savedTopics.length])

  useEffect(() => {
    if (queryTerms.length > 0 && filteredTopics.length === 1) {
      setActiveId(filteredTopics[0].id)
    }
  }, [filteredTopics, queryTerms.length])

  useEffect(() => {
    const term = query.trim().replace(/\s+/g, ' ').toLowerCase()
    if (term.length < 3) return undefined
    const timer = window.setTimeout(() => {
      setSearchCounts((current) => {
        const next = { ...current, [term]: (current[term] || 0) + 1 }
        localStorage.setItem('buscadordocs-search-counts', JSON.stringify(next))
        markProgress('searches')
        recordResearchEvent('search', { topic: term })
        playArcadeSound('tap')
        return next
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onProgress = (event) => setProgress(event.detail || readProgress())
    const onAction = (event) => {
      const type = event.detail?.type
      recordResearchEvent(type, event.detail || {})
      if (type === 'r') { setProgress(markProgress('rRuns')); playArcadeSound('success') }
      if (type === 'atlas') { setProgress(markProgress('atlas')); playArcadeSound('tap') }
      if (type === 'save') { setProgress(markProgress('reports')); playArcadeSound('success') }
      if (type === 'dataset') { setProgress(markProgress('datasets')); playArcadeSound('success') }
      if (type === 'analysis') { setProgress(markProgress('analyses')); playArcadeSound('success') }
    }
    window.addEventListener('buscadordocs-progress', onProgress)
    window.addEventListener('buscadordocs-action', onAction)
    return () => { window.removeEventListener('buscadordocs-progress', onProgress); window.removeEventListener('buscadordocs-action', onAction) }
  }, [])

  useEffect(() => {
    const onInterfaceClick = (event) => {
      const control = event.target.closest('.section-nav button, .topic-link, .area-toggle, .home-topic-list button, .atlas-related-list button')
      if (control) playArcadeSound('tap')
    }
    document.addEventListener('click', onInterfaceClick)
    return () => document.removeEventListener('click', onInterfaceClick)
  }, [])

  function selectTopic(topic) {
    setActiveId(topic.id)
    setQuery('')
    setActiveSection('library')
    setOpenCategories((current) => [...new Set([...current, ...(topic.categories || [])])])
  }

  function toggleCategory(category) {
    setOpenCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category])
  }

  function toggleRetro() {
    setRetroMode((current) => {
      const next = !current
      localStorage.setItem('buscadordocs-retro', next ? 'on' : 'off')
      return next
    })
  }

  function toggleSound() {
    setSoundMode((current) => {
      const next = !current
      localStorage.setItem('buscadordocs-sound', next ? 'on' : 'off')
      return next
    })
  }

  function updatePreference(key, value, setter) {
    setter(value)
    localStorage.setItem(key, value)
  }

  function resetCustomization() {
    setRetroMode(false); setSoundMode(false); setPalette('green'); setMotionMode('full'); setDensity('comfortable'); setCustomizationOpen(false)
    localStorage.removeItem('buscadordocs-retro'); localStorage.removeItem('buscadordocs-sound'); localStorage.removeItem('buscadordocs-palette'); localStorage.removeItem('buscadordocs-motion'); localStorage.removeItem('buscadordocs-density')
  }

  return (
    <main className={`app-shell ${retroMode ? `retro-mode retro-${palette}` : ''} motion-${motionMode} density-${density}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><BookOpen size={19} strokeWidth={2.3} /></div>
          <div>
            <p className="brand-name">BuscadorDocs</p>
            <p className="brand-meta">Laboratorio de investigación</p>
          </div>
        </div>

        <div className="sidebar-intro">
          <span className="eyebrow">Mapa de estudio</span>
          <h1>Encuentra el hilo detrás del dato.</h1>
           <p>{allTopics.length} temas conectados con aplicaciones y ejemplos prácticos en R.</p>
        </div>

        <nav className="topic-nav" aria-label="Temas de la unidad">
          <div className="nav-heading"><span>Áreas</span><span>{String(availableCategories.length).padStart(2, '0')}</span></div>
          <div className="area-menu" aria-label="Áreas de conocimiento">
            {categoryGroups.map(({ category, topics: categoryTopics }) => {
              const isOpen = openCategories.includes(category)
              return (
                <div className={`area-group ${isOpen ? 'open' : ''}`} key={category}>
                  <button
                    className="area-toggle"
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleCategory(category)}
                  >
                    <span className="area-toggle-copy"><span className="area-marker" />{category}</span>
                    <span className="area-count">{String(categoryTopics.length).padStart(2, '0')}<ChevronRight size={14} className="area-chevron" /></span>
                  </button>
                  {isOpen && (
                    <div className="area-topics">
                      {categoryTopics.map((topic) => {
                        const Icon = topic.icon
                        const isActive = topic.id === activeId
                        return (
                          <button
                            className={`topic-link ${isActive ? 'active' : ''}`}
                            key={`${category}-${topic.id}`}
                            onClick={() => selectTopic(topic)}
                            type="button"
                          >
                            <span className="topic-icon"><Icon size={16} /></span>
                            <span className="topic-copy"><strong>{topic.title}</strong><small>{topic.short}</small></span>
                            <ChevronRight size={15} className="topic-arrow" />
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </nav>

        <div className="sidebar-footnote">
          <CircleHelp size={16} />
          <span>Consulta por concepto, oportunidad o ejemplo.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><strong>CONSULTA RÁPIDA</strong></div>
          <nav className="section-nav" aria-label="Secciones principales">
            <button className={activeSection === 'home' ? 'active' : ''} type="button" onClick={() => setActiveSection('home')}><House size={14} /> Inicio</button>
            <button className={activeSection === 'lab' ? 'active' : ''} type="button" onClick={() => setActiveSection('lab')}><FlaskConical size={14} /> Laboratorio</button>
            <button className={activeSection === 'chat' ? 'active' : ''} type="button" onClick={() => setActiveSection('chat')}><MessageCircle size={14} /> Chat rápido</button>
            <button className={activeSection === 'library' ? 'active' : ''} type="button" onClick={() => setActiveSection('library')}><BookOpen size={14} /> Biblioteca</button>
          <button className={activeSection === 'dashboard' ? 'active' : ''} type="button" onClick={() => setActiveSection('dashboard')}><BarChart3 size={14} /> Dashboard</button>
          <button className={activeSection === 'atlas' ? 'active' : ''} type="button" onClick={() => setActiveSection('atlas')}><Network size={14} /> Atlas</button>
          <button className={activeSection === 'route' ? 'active' : ''} type="button" onClick={() => setActiveSection('route')}><Route size={14} /> Ruta</button>
          </nav>
          <div className="visual-controls" aria-label="Personalización visual">
            <button className={customizationOpen ? 'is-on' : ''} type="button" onClick={() => setCustomizationOpen((current) => !current)} aria-expanded={customizationOpen} title="Abrir personalización"><Settings2 size={13} /> Personalizar</button>
            <button className={retroMode ? 'is-on' : ''} type="button" onClick={toggleRetro} aria-pressed={retroMode} title="Activar estilo Data Arcade"><span className="pixel-toggle" /> Arcade</button>
          </div>
          {customizationOpen && <section className="customization-popover" aria-label="Preferencias de apariencia">
            <div className="customization-popover-head"><div><span className="micro-label">Personalización</span><strong>Configura tu consola</strong></div><button type="button" onClick={resetCustomization} title="Restaurar configuración"><RotateCcw size={13} /> Restablecer</button></div>
            <div className="customization-group"><span>Paleta de la consola</span><div className="palette-options"><button className={`palette-card ${palette === 'green' ? 'selected' : ''}`} type="button" onClick={() => updatePreference('buscadordocs-palette', 'green', setPalette)}><i className="palette-preview palette-preview-green"><b /><b /><b /></i><strong>Terminal verde</strong><small>Investigación</small></button><button className={`palette-card ${palette === 'amber' ? 'selected' : ''}`} type="button" onClick={() => updatePreference('buscadordocs-palette', 'amber', setPalette)}><i className="palette-preview palette-preview-amber"><b /><b /><b /></i><strong>Arcade ámbar</strong><small>Alta energía</small></button><button className={`palette-card ${palette === 'blue' ? 'selected' : ''}`} type="button" onClick={() => updatePreference('buscadordocs-palette', 'blue', setPalette)}><i className="palette-preview palette-preview-blue"><b /><b /><b /></i><strong>Cyber azul</strong><small>Modo nocturno</small></button><button className={`palette-card ${palette === 'mono' ? 'selected' : ''}`} type="button" onClick={() => updatePreference('buscadordocs-palette', 'mono', setPalette)}><i className="palette-preview palette-preview-mono"><b /><b /><b /></i><strong>Monocromo</strong><small>Contraste limpio</small></button></div></div>
            <div className="customization-group"><span>Movimiento</span><div className="segmented-options"><button className={motionMode === 'full' ? 'selected' : ''} type="button" onClick={() => updatePreference('buscadordocs-motion', 'full', setMotionMode)}>Completo</button><button className={motionMode === 'calm' ? 'selected' : ''} type="button" onClick={() => updatePreference('buscadordocs-motion', 'calm', setMotionMode)}>Calmado</button><button className={motionMode === 'off' ? 'selected' : ''} type="button" onClick={() => updatePreference('buscadordocs-motion', 'off', setMotionMode)}>Reducido</button></div></div>
            <div className="customization-group"><span>Densidad</span><div className="segmented-options"><button className={density === 'comfortable' ? 'selected' : ''} type="button" onClick={() => updatePreference('buscadordocs-density', 'comfortable', setDensity)}>Cómoda</button><button className={density === 'compact' ? 'selected' : ''} type="button" onClick={() => updatePreference('buscadordocs-density', 'compact', setDensity)}>Compacta</button></div></div>
            <div className="customization-footer"><button type="button" onClick={toggleSound}>{soundMode ? <Volume2 size={13} /> : <VolumeX size={13} />} Sonidos {soundMode ? 'activos' : 'apagados'}</button><small>Las preferencias se guardan en este navegador.</small></div>
          </section>}
          <div className="status-chip"><span className="status-dot" /> base local + guardados</div>
        </header>

        <div className="content-wrap">
          {activeSection === 'home' && (
            <section className="home-view" aria-labelledby="home-title">
              <div className="home-hero">
                <div>
                  <div className="stage-kicker"><span className="line" /> Centro de investigación</div>
                  <h2 id="home-title"><span>De la pregunta</span><em>a la evidencia.</em></h2>
                  <p className="stage-description">Organiza temas, explora documentos y convierte una búsqueda en un análisis reproducible con datos, hallazgos y código R.</p>
                  <div className="home-actions">
                    <button className="primary-action" type="button" onClick={() => setActiveSection('lab')}><FlaskConical size={16} /> Abrir laboratorio <ArrowUpRight size={14} /></button>
                    <button className="secondary-action" type="button" onClick={() => setActiveSection('library')}><BookOpen size={16} /> Explorar biblioteca</button>
                  </div>
                </div>
                <div className="home-orbit" aria-hidden="true"><span /><span /><span /><strong>datos<br />→ evidencia</strong><small>MAPA / 01</small></div>
              </div>
              <div className="home-stats scroll-reveal" data-scroll-reveal>
                <div><strong>{String(allTopics.length).padStart(2, '0')}</strong><span>temas conectados</span></div>
                <div><strong>{String(availableCategories.length).padStart(2, '0')}</strong><span>áreas de conocimiento</span></div>
                <div><strong>{String(savedTopics.length).padStart(2, '0')}</strong><span>informes guardados</span></div>
              </div>
              <section className="arcade-progress scroll-reveal" data-scroll-reveal aria-labelledby="progress-title">
                <div className="arcade-progress-head"><div><span className="micro-label">Progreso de investigación</span><h3 id="progress-title">Tu consola de análisis</h3></div><strong>{Math.min(100, Math.round(((progress.searches > 0 ? 1 : 0) + (progress.atlas > 0 ? 1 : 0) + (progress.rRuns > 0 ? 1 : 0) + (progress.reports > 0 ? 1 : 0)) / 4 * 100))}%</strong></div>
                <div className="arcade-progress-track"><i style={{ width: `${Math.min(100, ((progress.searches > 0 ? 1 : 0) + (progress.atlas > 0 ? 1 : 0) + (progress.rRuns > 0 ? 1 : 0) + (progress.reports > 0 ? 1 : 0)) / 4 * 100)}%` }} /></div>
                <div className="achievement-row"><span className={progress.searches > 0 ? 'unlocked' : ''}>⌕ <b>Explorador</b><small>{progress.searches || 0} búsquedas</small></span><span className={progress.atlas > 0 ? 'unlocked' : ''}>◈ <b>Cartógrafo</b><small>{progress.atlas || 0} recorridos</small></span><span className={progress.rRuns > 0 ? 'unlocked' : ''}>R <b>Analista</b><small>{progress.rRuns || 0} ejecuciones</small></span><span className={progress.reports > 0 ? 'unlocked' : ''}>▣ <b>Archivista</b><small>{progress.reports || 0} informes</small></span></div>
              </section>
              <section className="home-popular scroll-reveal" data-scroll-reveal aria-labelledby="popular-title">
                <div className="home-popular-heading"><div><span className="micro-label">Actividad de búsqueda</span><h3 id="popular-title">Tus temas con más búsquedas</h3></div><span className="home-popular-badge">TOP 03</span></div>
                {popularSearches.length ? <div className="xp-rankings">{popularSearches.map(([term, count], index) => <button type="button" className="xp-row" key={term} onClick={() => { setQuery(term); setActiveSection('library') }}><span className="xp-rank">{String(index + 1).padStart(2, '0')}</span><span className="xp-copy"><strong>{term}</strong><span className="xp-track"><i style={{ width: `${Math.max(12, (count / popularMax) * 100)}%` }} /></span></span><span className="xp-score">{count}<small> búsq.</small></span></button>)}</div> : <button className="xp-empty" type="button" onClick={() => setActiveSection('library')}>Aún no hay búsquedas registradas. Explora un tema para comenzar <ArrowUpRight size={14} /></button>}
              </section>
              <div className="home-grid scroll-reveal" data-scroll-reveal>
                <article className="home-panel home-panel-highlight">
                  <span className="micro-label">Flujo recomendado</span>
                  <h3>Investiga sin perder el hilo</h3>
                  <div className="flow-steps"><span><b>01</b> Formula el tema</span><span><b>02</b> Mina la evidencia</span><span><b>03</b> Guarda el informe</span></div>
                </article>
                <article className="home-panel">
                  <span className="micro-label">Acceso rápido</span>
                  <h3>Últimos temas de tu mapa</h3>
                  <div className="home-topic-list">{allTopics.slice(0, 3).map((topic) => <button type="button" key={topic.id} onClick={() => selectTopic(topic)}><span>{topic.title}</span><ChevronRight size={14} /></button>)}</div>
                </article>
              </div>
            </section>
          )}

          {activeSection === 'lab' && <section className="section-view" aria-labelledby="lab-section-title"><div className="section-heading"><div><span className="eyebrow">Sección 01</span><h2 id="lab-section-title">Laboratorio de análisis</h2></div><p>Carga un CSV, revisa su calidad y encuentra patrones antes de tomar decisiones.</p></div><Laboratory topics={allTopics} /></section>}
          {activeSection === 'dashboard' && <Dashboard topic={activeTopic} />}
          {activeSection === 'atlas' && <AtlasView topic={activeTopic} relatedTopics={relatedTopics} onSelectTopic={(topic) => { setActiveId(topic.id); setOpenCategories((current) => [...new Set([...current, ...(topic.categories || [])])]) }} />}
          {activeSection === 'route' && <EvidenceRoute topic={activeTopic} progress={progress} onNavigate={setActiveSection} />}
          {activeSection === 'chat' && <MiningChatbot />}

          {activeSection === 'library' && <>
          <section className="search-stage">
            <div className="stage-kicker"><span className="line" /> Pregunta algo a tu biblioteca</div>
            <h2>¿Qué necesitas entender<br /><em>hoy?</em></h2>
            <p className="stage-description">Escribe un concepto o elige un tema para ver su definición, una oportunidad de uso y un ejemplo listo para R.</p>
            <div className="search-quick-picks" aria-label="Temas sugeridos">
              <span>Explora una ruta</span>
              {quickTopics.map((topic) => <button key={topic.id} type="button" onClick={() => { setQuery(topic.title); setActiveId(topic.id) }}>{topic.title}</button>)}
            </div>
            <label className="search-box">
              <Search size={21} />
              <input
                aria-label="Buscar en la biblioteca"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Prueba: predicción, ETL, CRISP-DM..."
              />
              <kbd>⌘ K</kbd>
            </label>
            {query && (
              <div className="search-results" aria-label="Resultados de búsqueda">
                <div className="search-result-heading">
                  <span>{hasIncompleteQuery ? 'Escribe para buscar' : 'Exploración del tema'}</span>
                </div>
                {queryTerms.length > 0 && <TopicAnalysis tema={query} />}
                <div className="research-library-label">En tu biblioteca <span>{filteredTopics.length} {filteredTopics.length === 1 ? 'tema' : 'temas'}</span></div>
                {hasIncompleteQuery ? <p className="search-empty">Escribe al menos 2 caracteres para filtrar tu biblioteca.</p> : filteredTopics.length > 0 ? filteredTopics.map((topic) => (
                  <button className="search-result" key={topic.id} onClick={() => selectTopic(topic)} type="button">
                    <span className="search-result-number">{topic.number}</span>
                    <span className="search-result-copy">
                      <strong>{topic.title}</strong>
                      <small>{topic.short}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                )) : (
                  <details className="assist-panel research-advanced">
                    <summary>¿Quieres ampliar la búsqueda?</summary>
                    <p className="search-empty">Este tema todavía no está en tu biblioteca. Puedes generar su informe abajo o explorar otras fuentes aquí.</p>
                    <BackendResults tema={query} />
                    {buildAssistedQueries(query).map((item) => (
                      <div className="assist-query" key={item.key}>
                        <div className="assist-query-head">
                          <strong>{item.label}</strong>
                          <span>
                            <button type="button" onClick={() => navigator.clipboard?.writeText(item.query)}>Copiar</button>
                            <a href={item.url} target="_blank" rel="noreferrer">Abrir base <ArrowUpRight size={12} /></a>
                          </span>
                        </div>
                        <code>{item.query}</code>
                      </div>
                    ))}
                    <ol className="assist-steps">
                      <li>Ejecuta Scholar + OpenAlex hoy y registra fecha, base, DOI y citas.</li>
                      <li>Elimina duplicados por DOI/título y puntúa 80/100.</li>
                      <li>Pégame aquí 1-2 resúmenes y te devuelvo definición + oportunidad + ejemplo R + BibTeX.</li>
                    </ol>
                    <div className="assist-actions">
                      <button type="button" onClick={() => downloadText(`busqueda_${query.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.md`, buildProtocolMarkdown(query.trim(), buildAssistedQueries(query)))}>Descargar protocolo .md</button>
                    </div>
                  </details>
                )}
                {queryTerms.length > 0 && <Investigator key={query.trim()} tema={query} onSaved={loadSavedTopics} />}
              </div>
            )}
          </section>

          <section className="topic-header">
            <div>
              <div className="topic-number">{activeTopic.saved ? 'GUARDADO EN SUPABASE' : `${activeTopic.number} / ${String(topics.length).padStart(2, '0')}`}</div>
              <h3>{activeTopic.title}</h3>
            </div>
            <div className="topic-meta">
              <div className="topic-tags">{activeTopic.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
               {activeTopic.saved ? (
                 <button className="source-link source-button" type="button" onClick={() => setSavedPreviewOpen(true)}>Previsualizar PDF <ArrowUpRight size={13} /></button>
               ) : <span className="source-link">Documento LaTeX <ArrowUpRight size={13} /></span>}
            </div>
          </section>

          <section className="answer-grid" aria-live="polite">
            <article className="answer-block definition-block">
              <div className="block-label"><span className="label-mark">A</span><span>En una frase</span></div>
              <p>{activeTopic.definition}</p>
            </article>
            <article className="answer-block opportunity-block">
              <div className="block-label"><span className="label-mark">B</span><span>¿Para qué sirve?</span></div>
              <p>{activeTopic.opportunity}</p>
              <button className="text-action" type="button" onClick={() => document.getElementById('code-example')?.scrollIntoView({ behavior: 'smooth' })}>Ver ejemplo aplicado <ArrowUpRight size={15} /></button>
            </article>
          </section>

          <section className="topic-brief" aria-label={`Ficha rápida de ${activeTopic.title}`}>
            <div className="topic-brief-head"><div><span className="micro-label">Ficha rápida</span><h4>Contexto del tema</h4></div><span className="topic-brief-status">{activeTopic.saved ? 'Informe guardado' : 'Documento de la unidad'}</span></div>
            <div className="topic-brief-grid">
              <div><span>Área principal</span><strong>{activeTopic.categories?.[0] || 'Otros'}</strong></div>
              <div><span>Material disponible</span><strong>{activeTopic.report?.referencias?.length ? `${activeTopic.report.referencias.length} referencias` : 'Ficha + código R'}</strong></div>
              <div><span>Tipo de lectura</span><strong>{activeTopic.saved ? 'Informe minado' : 'Tema de estudio'}</strong></div>
              <div><span>Próximo paso</span><strong>{activeTopic.saved ? 'Revisar fuentes' : 'Investigar tema'}</strong></div>
            </div>
            <p>{activeTopic.report?.alcance || activeTopic.report?.conceptosInterpretacion || activeTopic.short || `Explora cómo ${activeTopic.title} se relaciona con la minería de datos y revisa el ejemplo aplicado.`}</p>
          </section>

          <section className="code-section" id="code-example">
            <div className="code-heading">
              <div>
                <div className="block-label"><span className="label-mark">C</span><span>En práctica</span></div>
                <h4>{activeTopic.example}</h4>
              </div>
              <span className="r-badge"><Braces size={14} /> R</span>
            </div>
            <div className="code-window">
              <div className="code-topline"><span><i /><i /><i /></span><span>ejemplo_{activeTopic.id.toLowerCase()}.R</span><button type="button" onClick={() => navigator.clipboard?.writeText(activeTopic.code)}>Copiar código</button></div>
              <pre><code>{activeTopic.code}</code></pre>
               <RExecution code={activeTopic.code} />
            </div>
          </section>

          <footer className="content-footer"><span>Conceptos sobre minería de datos</span><span>Fuentes organizadas en la carpeta de búsquedas <ArrowUpRight size={13} /></span></footer>
          </>}
        </div>
      </section>
      {savedPreviewOpen && savedPreview && <PreviewModal investigation={savedPreview} onClose={() => setSavedPreviewOpen(false)} />}
    </main>
  )
}

export default App

const root = import.meta.hot?.data.reactRoot || createRoot(document.getElementById('root'))
if (import.meta.hot) import.meta.hot.data.reactRoot = root
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
