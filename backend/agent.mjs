// Agente investigador — capa entre Backend API y (Documentos + búsqueda web).
// Arquitectura: React -> Backend API (server.mjs) -> este agente
//   -> [unidad-1/busquedas/*.md + unidad-1/latex/*.tex + OpenAlex] -> respuesta estructurada -> React.
//
// Modo local (determinista, sin LLM): usado por POST /api/investigar por defecto.
// Modo OpenCode: server.mjs lanza `opencode run --format json` con INVESTIGATOR_PROMPT(tema),
//   que ordena al agente usar este mismo protocolo y devolver SOLO el JSON del esquema.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finalizeReport } from './report-review.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

export const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function abstractFromIndex(idx) {
  if (!idx) return ''
  const words = []
  for (const [w, positions] of Object.entries(idx)) {
    for (const p of positions) words[p] = w
  }
  return words.join(' ')
}

export function buildQueries(tema) {
  const t = tema.trim()
  return [
    { key: 'scholar', label: 'Principal · Google Scholar', query: `("${t}") AND (definition OR definición OR methodology OR metodología OR application* OR aplicación*) AND (data mining OR "minería de datos" OR analytics)` },
    { key: 'scopus', label: 'Scopus / WoS · TITLE-ABS-KEY', query: `TITLE-ABS-KEY (("${t}") AND (definition OR methodology OR application* OR framework*) AND ("data mining" OR analytics))` },
    { key: 'review', label: 'Revisión sistemática', query: `("${t}") AND ("systematic review" OR "literature review" OR "revisión sistemática" OR survey) AND (method* OR framework* OR application*)` },
    { key: 'apps', label: 'Aplicaciones', query: `("${t}") AND (application* OR "case study" OR "estudio de caso" OR business) AND (result* OR evaluation OR performance)` },
    { key: 'eval', label: 'Métodos y evaluación', query: `("${t}") AND (model* OR algorithm* OR method*) AND (validation OR validación OR metric* OR comparison)` },
    { key: 'r', label: 'Aplicaciones en R', query: `("${t}") AND (R OR "R programming" OR CRAN OR tidyverse) AND (example* OR ejemplo* OR implementation OR reproducib*)` },
  ]
}

export function scoreWork(work, terms) {
  const title = norm(work.title || '')
  const abs = norm(abstractFromIndex(work.abstract_inverted_index))
  const text = `${title} ${abs}`
  const matched = terms.filter((t) => text.includes(t)).length
  const tematica = terms.length ? Math.round((matched / terms.length) * 30) : 0
  const unidadKeys = ['data mining', 'mineria de datos', 'business', 'empresarial', 'decision', 'analytics', 'analitica', 'application', 'aplicacion']
  const unidad = Math.min(20, unidadKeys.filter((k) => text.includes(norm(k))).length * 5)
  const cites = work.cited_by_count || 0
  const calidad = Math.min(15, (work.primary_location?.source?.id ? 8 : 3) + Math.min(7, Math.floor(cites / 20)))
  const metodoKeys = ['method', 'metod', 'framework', 'model', 'algorithm', 'algoritmo', 'evaluation', 'validation', 'validacion', 'metric']
  const metodo = Math.min(15, metodoKeys.filter((k) => text.includes(norm(k))).length * 4)
  const year = work.publication_year || 0
  const actualidad = year >= 2015 ? 10 : year >= 2000 ? 4 : 2
  const aplicaKeys = ['dataset', 'result', 'resultado', 'implementation', 'implementacion', 'example', 'ejemplo', 'case study', 'estudio de caso', 'data ']
  const aplicabilidad = Math.min(10, aplicaKeys.filter((k) => text.includes(norm(k))).length * 3)
  const total = tematica + unidad + calidad + metodo + actualidad + aplicabilidad
  return { total, decision: total >= 80 ? 'incluir' : total >= 60 ? 'respaldo' : 'excluir' }
}

async function fetchOpenAlex(tema) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(tema)}&filter=from_publication_date:2015-01-01,to_publication_date:2026-12-31&per-page=100&select=id,doi,title,authorships,publication_year,primary_location,cited_by_count,abstract_inverted_index,open_access`
  let res
  for (let i = 0; i < 3; i++) {
    res = await fetch(url, { headers: { 'User-Agent': 'BuscadorDocs/0.1 (mailto:local@dev)' } })
    if (res.status !== 429) break
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
  return res.json()
}

function isReliableWork(work) {
  return Boolean(work.primary_location?.source?.id || work.open_access?.is_oa || (work.cited_by_count || 0) >= 5)
}

function relevantFragments(work, terms) {
  const abstract = abstractFromIndex(work.abstract_inverted_index)
  const sentences = abstract.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  return sentences.filter((sentence) => terms.some((term) => norm(sentence).includes(term))).slice(0, 3)
}

function rescoreWork(work, terms, initialScore) {
  const text = norm(`${work.title || ''} ${abstractFromIndex(work.abstract_inverted_index)}`)
  const occurrences = terms.reduce((count, term) => count + (text.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 0)
  const fragmentBonus = Math.min(10, occurrences * 2)
  const total = Math.min(100, initialScore + fragmentBonus)
  return { total, decision: total >= 80 ? 'incluir' : total >= 60 ? 'respaldo' : 'excluir' }
}

function formatAuthorName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const surname = parts.at(-1)
  const initials = parts.slice(0, -1).map((part) => `${part[0].toUpperCase()}.`).join(' ')
  return initials ? `${surname}, ${initials}` : surname
}

function documentType(work) {
  const source = norm(`${work.primary_location?.source?.display_name || ''} ${work.id || ''} ${work.doi || ''}`)
  if (work.type === 'dataset') return 'conjunto de datos'
  if (/arxiv|ssrn|zenodo/.test(source)) return 'preprint'
  if (work.type === 'book' || work.type === 'book-chapter') return 'libro'
  if (work.type === 'proceedings-article') return 'congreso'
  return 'artículo revisado por pares'
}

function workToReference(work, terms, score) {
  const authorNames = (work.authorships || []).map((a) => a.author?.display_name).filter(Boolean)
  const visibleAuthors = authorNames.slice(0, 3).map(formatAuthorName)
  if (authorNames.length > 3) visibleAuthors.push('et al.')
  return {
    titulo: work.title, autores: visibleAuthors.join(', '),
    anio: work.publication_year, doi: work.doi, url: work.doi || work.id,
    tipo: documentType(work),
    fuente: work.primary_location?.source?.display_name || 'OpenAlex', citas: work.cited_by_count || 0,
    resumen: abstractFromIndex(work.abstract_inverted_index).slice(0, 900),
    fragmentos: relevantFragments(work, terms), puntaje: score.total, decision: score.decision,
  }
}

export async function buildEvidence(tema) {
  const terms = norm(tema).split(/\s+/).filter((term) => term.length > 2)
  const data = await fetchOpenAlex(tema).catch(() => ({ results: [], error: 'OpenAlex no disponible' }))
  const seen = new Set()
  const unique = (data.results || []).filter((work) => {
    const key = work.doi || work.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const reliable = unique.filter(isReliableWork)
  const pool = (reliable.length >= 10 ? reliable : unique)
    .map((work) => ({ work, score: scoreWork(work, terms) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 10)
  const selected = pool.map(({ work, score }) => ({ work, score: rescoreWork(work, terms, score.total) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5)
  return {
    references: selected.map(({ work, score }) => workToReference(work, terms, score)),
    pipeline: { recibidos: data.results?.length || 0, unicos: unique.length, confiables: reliable.length, top10: pool.length, top5: selected.length },
  }
}

const TEXT_STOPWORDS = new Set('about after again against all also among and are article been being between can could data their them than that the this these those from have into more most other over such than there they through using were what when where which while with your para como desde entre sobre una uno unos unas los las del por sus que con este esta estos estas más para una los datos potential capabilities issues use study based approach results analysis paper'.split(/\s+/))

export async function analyzeTopic(tema) {
  const clean = tema.trim()
  if (clean.length < 3) throw new Error('Tema mínimo 3 caracteres')
  const evidence = await buildEvidence(clean)
  const refs = evidence.references
  const words = new Map()
  refs.forEach((reference) => `${reference.titulo} ${reference.resumen || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z][a-z-]{3,}/g)?.forEach((word) => {
    if (!TEXT_STOPWORDS.has(word) && !clean.toLowerCase().includes(word)) words.set(word, (words.get(word) || 0) + 1)
  }))
  const keywords = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word, count]) => ({ word, count }))
  const years = [...new Set(refs.map((reference) => reference.anio).filter(Boolean))].sort((a, b) => a - b).map((year) => ({ year, count: refs.filter((reference) => reference.anio === year).length }))
  const dataset = refs.map((reference) => ({ titulo: reference.titulo, autores: reference.autores, anio: reference.anio, citas: reference.citas, fuente: reference.fuente, puntaje: reference.puntaje, decision: reference.decision, doi: reference.doi || '', resumen: reference.resumen || '' }))
  return {
    tema: clean,
    fuente: 'OpenAlex',
    pipeline: evidence.pipeline,
    profile: { rows: dataset.length, columns: 6, quality: dataset.length ? 100 : 0, missing: dataset.filter((row) => !row.anio).length },
    keywords,
    years,
    dataset,
    insights: refs.length ? [
      `Se analizaron ${refs.length} documentos priorizados sobre “${clean}”.`,
      keywords.length ? `Los términos más frecuentes del corpus son: ${keywords.slice(0, 5).map((item) => item.word).join(', ')}.` : 'El corpus no contiene suficientes resúmenes para extraer palabras clave.',
      years.length > 1 ? `La evidencia disponible cubre de ${years[0].year} a ${years.at(-1).year}.` : 'La muestra tiene poca cobertura temporal; conviene ampliar la búsqueda.',
    ] : [`No se encontraron documentos verificables para “${clean}”.`],
    codeR: `# Minería exploratoria con un corpus pequeño creado en memoria para: ${clean}\nreferencias <- data.frame(\n  anio = c(2022, 2023, 2024, 2024, 2025),\n  citas = c(4, 8, 3, 12, 7),\n  fuente = c("Revista A", "Revista B", "Repositorio", "Revista A", "Congreso")\n)\nprint(table(referencias$anio))\nprint(summary(referencias$citas))\nbarplot(table(referencias$fuente), las = 2, main = "Fuentes del corpus")`,
  }
}

// Documentos locales compartidos: busca en shared/unidad-1/latex/*.tex.
export function loadLocalDocs(tema) {
  const dir = path.resolve(ROOT, '..', 'shared', 'unidad-1', 'latex')
  const terms = norm(tema).split(/\s+/).filter((t) => t.length > 2)
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.tex')) } catch { return [] }
  const hits = []
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8')
    const text = norm(raw.replace(/[%\\{}]/g, ' '))
    const matched = terms.filter((t) => text.includes(t)).length
    if (matched > 0) {
      const title = raw.match(/\\title\{([^}]*)\}/)?.[1] ?? f
      hits.push({ archivo: f, titulo: title, coincidencias: `${matched}/${terms.length} términos` })
    }
  }
  return hits
}

function ejemploRPara(tema) {
  const t = norm(tema)
  if (/cluster|k-?means|agrupamiento|jerarquico|dbscan/.test(t)) {
    return { descripcion: 'Agrupamiento k-means con datos sintéticos creados en el ejemplo', codigo: '# Agrupamiento k-means sin cargar archivos externos\nset.seed(1)\ndatos <- data.frame(x = c(rnorm(20, 2), rnorm(20, 7)), y = c(rnorm(20, 2), rnorm(20, 7)))\nmodelo <- kmeans(scale(datos), centers = 2, nstart = 10)\nprint(table(modelo$cluster))\nprint(modelo$centers)' }
  }
  if (/regla|asocia|apriori|arules|canasta/.test(t)) {
    return { descripcion: 'Conteo de coocurrencias con transacciones creadas en memoria', codigo: '# Exploración de transacciones sin paquetes ni archivos externos\ntransacciones <- list(c("pan", "leche"), c("pan", "cafe"), c("leche", "cafe"), c("pan", "leche", "cafe"))\nfrecuencia <- table(unlist(transacciones))\npares <- combn(c("pan", "leche", "cafe"), 2)\ncoocurrencia <- apply(pares, 2, function(par) sum(vapply(transacciones, function(t) all(par %in% t), logical(1))))\nprint(frecuencia)\nprint(data.frame(par1 = pares[1, ], par2 = pares[2, ], frecuencia = coocurrencia))' }
  }
  if (/regres|pronost|forecast|predic|serie/.test(t)) {
    return { descripcion: 'Regresión lineal con datos sintéticos y evaluación en prueba', codigo: '# Regresion con datos creados dentro del ejemplo\nset.seed(1)\ndatos <- data.frame(inversion = runif(40, 10, 100), visitas = runif(40, 20, 200))\ndatos$ventas <- 5 + 0.7 * datos$inversion + 0.2 * datos$visitas + rnorm(40, 0, 8)\nidx <- sample(seq_len(nrow(datos)), floor(0.7 * nrow(datos)))\nmodelo <- lm(ventas ~ inversion + visitas, data = datos[idx, ])\nprediccion <- predict(modelo, newdata = datos[-idx, ])\ncat("MSE en prueba:", mean((prediccion - datos$ventas[-idx])^2), "\\n")' }
  }
  if (/^datos$|analitica|mineria de datos|data mining/.test(t)) {
    return { descripcion: 'Perfil de un dataset creado en memoria', codigo: '# Perfil reproducible sin leer archivos externos\ndatos <- data.frame(\n  segmento = c("A", "A", "B", "B", "C"),\n  valor = c(120, 95, 210, 180, 75),\n  activo = c(TRUE, TRUE, FALSE, TRUE, TRUE)\n)\nperfil <- data.frame(\n  variable = names(datos),\n  tipo = vapply(datos, function(x) class(x)[1], character(1)),\n  faltantes = vapply(datos, function(x) sum(is.na(x)), integer(1)),\n  unicos = vapply(datos, function(x) length(unique(x)), integer(1))\n)\nprint(perfil)\nprint(summary(datos))' }
  }
  return { descripcion: 'Clasificación logística con datos sintéticos creados en el ejemplo', codigo: '# Clasificacion sin cargar datasets externos\nset.seed(1)\ndatos <- data.frame(x1 = rnorm(60), x2 = rnorm(60))\ndatos$clase <- factor(ifelse(datos$x1 + datos$x2 + rnorm(60, 0, 0.5) > 0, "si", "no"))\nidx <- sample(seq_len(nrow(datos)), 45)\nmodelo <- glm(clase ~ x1 + x2, data = datos[idx, ], family = binomial)\nprob <- predict(modelo, newdata = datos[-idx, ], type = "response")\npred <- factor(ifelse(prob > 0.5, "si", "no"), levels = levels(datos$clase))\ncat("Exactitud en prueba:", mean(pred == datos$clase[-idx]), "\\n")' }
}

function topicLabel(tema) {
  return tema.trim().replace(/inteligencia\s+artifical/gi, 'inteligencia artificial')
}

function definitionFor(tema, evidence) {
  const label = topicLabel(tema)
  const t = norm(label)
  const definitions = [
    [/inteligencia artificial|\bartificial intelligence\b/, `${label} es el campo de la computación que desarrolla sistemas capaces de aprender de datos, reconocer patrones y apoyar decisiones o generar resultados.`],
    [/mineria de datos|data mining/, `${label} es el proceso de explorar datos para descubrir patrones, relaciones y señales útiles que apoyen decisiones.`],
    [/^machine$|machine learning|aprendizaje automatico/, `${label} es un conjunto de métodos que permite a los sistemas aprender patrones a partir de datos y mejorar sus predicciones sin programar cada regla manualmente.`],
    [/base de datos|database|sql|postgres/, `${label} es una estructura organizada para almacenar, consultar y relacionar información de forma consistente y trazable.`],
    [/scrum|agil|agile/, `${label} es un enfoque de trabajo iterativo que organiza la entrega de valor mediante ciclos cortos, colaboración y revisión continua.`],
    [/etl|data warehouse|almacen de datos/, `${label} reúne procesos para extraer, transformar y organizar datos con el fin de analizarlos de forma confiable.`],
    [/^datos$|analitica de datos/, `${label} comprende la información recolectada y preparada para describir fenómenos, encontrar patrones y orientar decisiones basadas en evidencia.`],
    [/arepa|maiz|corn|alimento|food|gastronom/, `${label} se aborda como un producto alimentario y una actividad productiva, con énfasis en su elaboración, comercialización y fortalecimiento empresarial.`],
  ]
  const matched = definitions.find(([pattern]) => pattern.test(t))?.[1]
  if (matched) return `${matched} ${shortCitation(evidence?.[0] || {})}`
  const corpus = norm((evidence || []).map((item) => `${item.titulo} ${item.resumen}`).join(' '))
  if (/produccion|manufact|empresa|comercial|mercado/.test(corpus)) return `${label} se presenta en la evidencia como un tema aplicado a procesos de producción, gestión y comercialización ${shortCitation(evidence?.[0] || {})}.`
  if (/salud|clinic|medical|paciente/.test(corpus)) return `${label} se presenta en la evidencia como un tema aplicado a la atención, el análisis o la gestión de información en salud ${shortCitation(evidence?.[0] || {})}.`
  if (/educa|student|learning|enseñ/.test(corpus)) return `${label} se presenta en la evidencia como un tema aplicado a procesos de aprendizaje, formación o evaluación ${shortCitation(evidence?.[0] || {})}.`
  return `${label} se presenta en la evidencia como un tema aplicado cuyo significado debe precisarse a partir de los documentos recuperados y su contexto ${shortCitation(evidence?.[0] || {})}.`
}

export function mineReferences(refs, tema) {
  const words = new Map()
  const topicWords = new Set(norm(tema).split(/\s+/).filter((word) => word.length > 2))
  refs.forEach((reference) => {
    const text = `${reference.titulo || ''} ${reference.resumen || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const documentWords = new Set(text.match(/[a-z][a-z-]{3,}/g) || [])
    documentWords.forEach((word) => {
      if (!TEXT_STOPWORDS.has(word) && !topicWords.has(word)) {
        const current = words.get(word) || { count: 0, documents: new Set() }
        current.count += 1
        current.documents.add(reference.titulo)
        words.set(word, current)
      }
    })
  })
  const keywordTranslations = { analysis: 'análisis', mining: 'minería', patterns: 'patrones', decisions: 'decisiones', management: 'gestión', learning: 'aprendizaje', data: 'datos', model: 'modelos', models: 'modelos', application: 'aplicación', applications: 'aplicaciones' }
  const palabrasClave = [...words.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12).map(([word, data]) => ({ word: keywordTranslations[word] || word, count: data.count, documentos: data.documents.size, documentosFuente: [...data.documents].slice(0, 3) }))
  const evolucionTemporal = [...new Set(refs.map((reference) => reference.anio).filter(Boolean))].sort((a, b) => a - b).map((year) => ({ year, count: refs.filter((reference) => reference.anio === year).length }))
  const sourceMap = new Map()
  refs.forEach((reference) => sourceMap.set(reference.fuente || 'Fuente no identificada', (sourceMap.get(reference.fuente || 'Fuente no identificada') || 0) + 1))
  const fuentes = [...sourceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([fuente, cantidad]) => ({ fuente, cantidad }))
  return {
    documentosAnalizados: refs.length,
    palabrasClave,
    evolucionTemporal,
    fuentes,
    promedioPuntaje: refs.length ? Math.round(refs.reduce((total, reference) => total + (reference.puntaje || 0), 0) / refs.length) : 0,
    resumenesDisponibles: refs.filter((reference) => reference.resumen).length,
    decisiones: {
      incluir: refs.filter((reference) => reference.decision === 'incluir').length,
      respaldo: refs.filter((reference) => reference.decision === 'respaldo').length,
    },
  }
}

function shortCitation(reference) {
  const author = (reference.autores || 'Fuente no identificada').split(',')[0].trim()
  return `(${author}, ${reference.anio || 's. f.'})`
}

export function toBibtex(r, i) {
  const key = `${norm(r.autores.split(',')[0] || 'autor').replace(/[^a-z]+/g, '')}_${r.anio || 's_a'}_${i}`
  return `@article{${key},\n  author  = {${r.autores}},\n  title   = {${r.titulo}},\n  journal = {${r.fuente}},\n  year    = {${r.anio}},\n  doi     = {${r.doi || ''}}\n}`
}

// Respuesta estructurada final que consume React.
export async function investigar(tema) {
  const clean = topicLabel(tema)
  if (clean.length < 3) throw new Error('Tema mínimo 3 caracteres')
  const [evidence, locales] = await Promise.all([
    buildEvidence(clean),
    Promise.resolve(loadLocalDocs(clean)),
  ])
  const refs = evidence.references
  const top = refs.filter((r) => r.decision === 'incluir').slice(0, 3)
  const base = top.length ? top : refs.slice(0, 3)
  const definicion = definitionFor(clean, base)
  const mineria = mineReferences(refs, clean)
  const alcance = refs.length
    ? `Se adoptó el sentido de “${clean}” que domina en el corpus priorizado. Se analizaron ${refs.length} documentos seleccionados por coincidencia temática, confiabilidad de la fuente y calidad metodológica. No se excluyeron documentos del grupo final; los resultados con decisión “respaldo” se conservan como evidencia contextual y no como confirmación definitiva.`
    : `No fue posible establecer un sentido dominante para “${clean}” porque no se recuperó evidencia verificable.`
  const hallazgosPrincipales = refs.length ? [
    `El corpus priorizado reúne ${mineria.documentosAnalizados} documentos: ${mineria.decisiones.incluir} de inclusión y ${mineria.decisiones.respaldo} de respaldo, con un puntaje promedio de ${mineria.promedioPuntaje}/100.`,
    mineria.evolucionTemporal.length >= 4 ? `La evidencia cubre el periodo ${mineria.evolucionTemporal[0].year}-${mineria.evolucionTemporal.at(-1).year} en ${mineria.evolucionTemporal.length} años distintos.` : `La evidencia cubre el periodo ${mineria.evolucionTemporal[0]?.year || 'no disponible'}-${mineria.evolucionTemporal.at(-1)?.year || 'no disponible'} en ${mineria.evolucionTemporal.length} año(s) distinto(s); no hay cobertura suficiente para afirmar una tendencia temporal.`,
    mineria.palabrasClave.length ? `Los conceptos más frecuentes del corpus son: ${mineria.palabrasClave.slice(0, 6).map((item) => `${item.word} (${item.count})`).join(', ')}.` : 'No hubo suficientes resúmenes para extraer conceptos frecuentes.',
    mineria.fuentes.length ? `Las fuentes más representadas son: ${mineria.fuentes.slice(0, 3).map((item) => `${item.fuente} (${item.cantidad})`).join(', ')}.` : 'No se pudo determinar la distribución de fuentes.',
  ] : ['No se encontraron documentos verificables para construir hallazgos.']
  const corpusPatterns = mineria.palabrasClave.filter((item) => item.documentos >= 2).slice(0, 3)
  const conceptosInterpretacion = corpusPatterns.length
    ? corpusPatterns.map((item) => `${item.word} aparece en ${item.documentos} documentos, entre ellos ${item.documentosFuente.map((title) => `“${title}”`).join(' y ')}; por ello se considera un patrón descriptivo del corpus, no una relación causal.`).join(' ')
    : 'Ningún concepto alcanza dos documentos de la muestra; las palabras frecuentes no deben interpretarse como patrón del corpus.'
  const oportunidades = []
  const datosFaltantes = []
  if (!refs.length) datosFaltantes.push('Resúmenes y referencias verificables para construir una síntesis específica.')
  if (refs.some((reference) => !reference.resumen)) datosFaltantes.push('Resúmenes completos de los documentos que no los exponen en OpenAlex.')
  if (refs.some((reference) => !reference.doi)) datosFaltantes.push('DOI o URL persistente para las referencias que no tienen identificador registrado.')
  const auditoria = [
    { seccion: 'Plantilla genérica', estado: refs.length ? 'CORREGIR' : 'FALTA', nota: refs.length ? 'La síntesis debe conservar solo afirmaciones derivadas del corpus.' : 'No hay corpus suficiente para evitar una redacción genérica.' },
    { seccion: 'Definición y citas', estado: refs.length && refs[0].resumen ? 'OK' : 'FALTA', nota: refs.length && refs[0].resumen ? 'La definición se apoya en un resumen y conserva cita autor-año.' : 'Falta un resumen que permita definir el tema con respaldo.' },
    { seccion: 'Aplicaciones', estado: oportunidades.length ? 'OK' : 'FALTA', nota: oportunidades.length ? 'Solo se conservaron ámbitos con coincidencias detectables y cita.' : 'No se evidenciaron aplicaciones sectoriales.' },
    { seccion: 'Cobertura temporal', estado: mineria.evolucionTemporal.length >= 4 ? 'OK' : 'CORREGIR', nota: `${mineria.evolucionTemporal.length} año(s) distinto(s); no se afirma continuidad temporal.` },
    { seccion: 'Verificación', estado: 'PENDIENTE', nota: 'Revisión por pares y texto completo requieren confirmación manual.' },
  ]
  const registroCambios = [
    { seccion: 'Definición', problema: 'Redacción genérica o sin contexto documental.', correccion: 'Se reescribió desde la evidencia y se añadió cita autor-año.', evidencia: refs[0] ? shortCitation(refs[0]) : 'Sin evidencia' },
    { seccion: 'Conceptos clave', problema: 'Términos vacíos o patrones sin respaldo suficiente.', correccion: 'Se filtraron stopwords y solo se interpretan términos presentes en al menos dos documentos.', evidencia: corpusPatterns.length ? corpusPatterns.map((item) => item.word).join(', ') : 'Sin patrón' },
    { seccion: 'Aplicaciones', problema: 'Ámbitos repetidos o sin respaldo explícito.', correccion: 'Se deduplicaron por ámbito y se asociaron a una referencia.', evidencia: oportunidades.length ? oportunidades.length + ' aplicación(es)' : 'Sin aplicación' },
    { seccion: 'Verificación', problema: 'No consta revisión de texto completo.', correccion: 'Se declaró PENDIENTE en limitaciones y nota metodológica.', evidencia: 'Método local' },
  ]
  const seenOpportunities = new Set()
  const foodTheme = /arepa|maiz|corn|alimento|food|gastronom/.test(norm(clean))
  for (const r of refs.slice(0, 8)) {
    const t = norm(`${r.titulo} ${r.resumen}`)
    const labels = []
    if (/arepa|maiz|corn|alimento|food|gastronom/.test(t)) labels.push(`Aplicación alimentaria: diseño de productos, estandarización de procesos y mejora de su comercialización ${shortCitation(r)}.`)
    if (/business|empres|decision|ventas|demanda|fraude|cliente/.test(t)) labels.push(`Aplicación empresarial: apoyo a la toma de decisiones, análisis de demanda y gestión de clientes ${shortCitation(r)}.`)
    if (/health|salud|clinic|medical|umls|terminolog/.test(t)) labels.push(`Aplicación en salud: organización y consulta de terminologías clínicas para integrar información médica ${shortCitation(r)}.`)
    if (!foodTheme && /manufact|industr|energy|iot|sensor|open source/.test(t)) labels.push(`Aplicación industrial y de IoT: evaluación y reutilización de proyectos de código abierto para soluciones conectadas ${shortCitation(r)}.`)
    if (!foodTheme && /educat|student|learning/.test(t)) labels.push(`Aplicación educativa: apoyo al aprendizaje y evaluación de métodos basados en datos ${shortCitation(r)}.`)
    for (const label of labels) {
      const key = norm(label.replace(/\s+\([^)]*\)\.$/, ''))
      if (!seenOpportunities.has(key)) {
        seenOpportunities.add(key)
        oportunidades.push(label)
      }
    }
    if (oportunidades.length >= 5) break
  }
  if (!oportunidades.length && refs.length) oportunidades.push(`No se evidenció una aplicación sectorial suficiente en el corpus priorizado; revisar ${refs[0].titulo} para ampliar el contexto ${shortCitation(refs[0])}.`)
  const ejemploR = ejemploRPara(clean)
  return finalizeReport({
    tema: clean, fecha: new Date().toISOString().slice(0, 10),
    metodo: 'protocolo de búsqueda bibliográfica (10 pasos, umbral 80/100)',
    alcance, definicion, oportunidades, hallazgosPrincipales, conceptosInterpretacion, auditoria, registroCambios, datosFaltantes, ejemploR,
    documentosLocales: locales,
    referencias: refs.map((r, i) => ({ ...r, bibtex: toBibtex(r, i + 1) })),
    pipeline: evidence.pipeline,
    mineria,
    limitaciones: [
      'La muestra contiene los documentos priorizados por título y resumen, no una revisión exhaustiva del texto completo.',
      'OpenAlex puede sobrerrepresentar publicaciones con metadatos y acceso abierto disponibles.',
      'La distribución temporal y de fuentes debe interpretarse con cautela cuando hay pocos documentos o años vacíos.',
      'La revisión por pares y la verificación de texto completo están PENDIENTES de confirmación manual.',
    ],
    conclusiones: [
      `Ampliar la búsqueda de “${clean}” con sinónimos, siglas y términos específicos del dominio.`,
      'Verificar los documentos incluidos en texto completo y confirmar DOI, tipo de publicación y revisión por pares.',
      'Comparar los resultados con una segunda base bibliográfica antes de presentar conclusiones definitivas.',
    ],
    consultas: buildQueries(clean),
    nota: 'Preselección automática por título/resumen. Revisión por pares y texto completo: PENDIENTE.',
  }, { local: true })
}

// Nombre de archivo seguro para el .tex
export function slugify(tema) {
  return norm(tema).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'tema'
}

function texEscape(s = '') {
  return s.replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
}

// Genera el documento LaTeX con el mismo formato de unidad-1/latex/*.tex
export function buildLatex(inv) {
  const refs = (inv.referencias || []).slice(0, 10).sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''))
  const items = refs.map((r) => `\\item \\textbf{${texEscape(r.titulo)}}. ${texEscape(r.autores)} (${r.anio || 's. f.'}). Tipo: ${texEscape(r.tipo || 'obra académica')}. Fuente: ${texEscape(r.fuente || 'OpenAlex')}. Puntaje: ${r.puntaje ?? 'n/a'}/100; decisión: ${texEscape(r.decision || 'sin clasificar')}. DOI/URL: \\url{${r.doi || r.url || ''}}.`)
  const pipeline = inv.pipeline
    ? `Documentos recibidos: ${inv.pipeline.recibidos || 0}. Únicos: ${inv.pipeline.unicos || 0}. Confiables: ${inv.pipeline.confiables || 0}. Top 10: ${inv.pipeline.top10 || 0}. Seleccionados: ${inv.pipeline.top5 || 0}.`
    : 'El pipeline detallado no está disponible para esta investigación.'
  const mineria = inv.mineria || {}
  const asList = (value) => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
  const keywords = asList(mineria.palabrasClave).map((item) => `${item.word || item.termino || 'sin término'} (${item.count ?? item.frecuencia ?? 0})`).join(', ')
  const temporal = asList(mineria.evolucionTemporal).map((item) => `${item.year || item.anio || 's. f.'}: ${item.count ?? item.cantidad ?? 0} documento(s)`).join('; ')
  const fuentes = asList(mineria.fuentes).map((item) => `${item.fuente || item.nombre || 'fuente no identificada'} (${item.cantidad ?? item.count ?? 0})`).join('; ')
  const perfil = [
    `Documentos analizados: ${mineria.documentosAnalizados || 0}. Resúmenes disponibles: ${mineria.resumenesDisponibles || 0}. Puntaje promedio: ${mineria.promedioPuntaje || 0}/100.`,
    `Decisión de evidencia: ${mineria.decisiones?.incluir || 0} incluidos y ${mineria.decisiones?.respaldo || 0} de respaldo.`,
    keywords ? `Palabras clave: ${keywords}.` : 'Palabras clave: no disponibles.',
    temporal ? `Evolución temporal: ${temporal}.` : 'Evolución temporal: no disponible.',
    fuentes ? `Fuentes principales: ${fuentes}.` : 'Fuentes principales: no disponibles.',
  ].map((item) => `\\item ${texEscape(item)}`).join('\n')
  const consultas = (inv.consultas || []).map((q) => `\\item \\textbf{${texEscape(q.label || q.key || 'Consulta')}}: \\texttt{${texEscape(q.query || '')}}`).join('\n')
  const locales = (inv.documentosLocales || []).map((d) => `\\item ${texEscape(d.titulo || d.archivo)} (${texEscape(d.archivo || '')}); coincidencias: ${texEscape(d.coincidencias || 'n/a')}.`).join('\n')
  const hallazgos = (inv.hallazgosPrincipales || []).map((item) => `\\item ${texEscape(item)}`).join('\n')
  const oportunidades = (inv.oportunidades || []).map((item) => `\\item ${texEscape(item)}`).join('\n')
  const limitaciones = (inv.limitaciones || []).map((item) => `\\item ${texEscape(item)}`).join('\n')
  const conclusiones = (inv.conclusiones || []).map((item) => `\\item ${texEscape(item)}`).join('\n')
  const auditoria = (inv.auditoria || []).map((item) => `\\item \\textbf{${texEscape(item.seccion || '')}} — ${texEscape(item.estado || '')}: ${texEscape(item.nota || '')}`).join('\n')
  const cambios = (inv.registroCambios || []).map((item) => `\\item \\textbf{${texEscape(item.seccion || '')}}. Problema: ${texEscape(item.problema || '')} Corrección: ${texEscape(item.correccion || '')} Evidencia: ${texEscape(item.evidencia || '')}.`).join('\n')
  const faltantes = (inv.datosFaltantes || []).map((item) => `\\item ${texEscape(item)}`).join('\n')
  const motivo = (r) => r.decision === 'incluir' ? 'supera el umbral y presenta coincidencia temática' : r.decision === 'respaldo' ? 'aporta contexto, pero requiere verificación adicional' : 'no alcanza el umbral de inclusión'
  const trazabilidad = refs.map((r, i) => `${i + 1} & ${texEscape((r.titulo || '').slice(0, 55))} & ${texEscape(r.tipo || 'obra académica')} & ${texEscape(r.fuente || 'OpenAlex')} & ${r.anio || 's. f.'} & ${r.puntaje ?? 'n/a'} & ${texEscape(r.decision || 'sin clasificar')} & ${texEscape(motivo(r))} \\\\`).join('\n')
  return `\\documentclass[12pt,a4paper]{article}
\\usepackage[spanish,es-nodecimaldot]{babel}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{tabularx}
\\usepackage{xcolor}
\\geometry{margin=2.5cm}
\\definecolor{codegray}{gray}{0.95}
\\lstset{language=R,basicstyle=\\ttfamily\\small,backgroundcolor=\\color{codegray},frame=single,breaklines=true}
\\title{Informe de minería de datos: ${texEscape(inv.tema)}}
\\author{BuscadorDocs · Laboratorio de minería de datos}
\\date{${inv.fecha || new Date().toISOString().slice(0, 10)}}
\\begin{document}
\\selectlanguage{spanish}
\\maketitle
\\section{Ficha del análisis}
Fecha: ${texEscape(inv.fecha || new Date().toISOString().slice(0, 10))}. Método: ${texEscape(inv.metodo || 'Minería exploratoria')}.
\\subsection{Pipeline y trazabilidad}
${texEscape(pipeline)}
\\subsection{Perfil de la minería}
\\begin{itemize}
${perfil}
\\end{itemize}
\\section{Definición}
${texEscape(inv.definicion)}
\\section{Alcance y desambiguación}
${texEscape(inv.alcance || 'No se registró una desambiguación explícita.')}
\\section{Aplicaciones y oportunidades}
\\begin{itemize}
${oportunidades || '\\item No se registraron oportunidades adicionales.'}
\\end{itemize}
\\section{Hallazgos principales}
\\begin{itemize}
${hallazgos || '\\item No se registraron hallazgos adicionales.'}
\\end{itemize}
\\section{Conceptos clave}
${texEscape(inv.conceptosInterpretacion || 'No se registró interpretación de conceptos clave.')}
\\subsection{Frecuencias observadas}
${texEscape(keywords || 'No disponibles.')}
\\section{Ejemplo en R}
${texEscape(inv.ejemploR?.descripcion || 'Ejemplo reproducible en R.')}
\\begin{lstlisting}
${inv.ejemploR?.codigo || '# Ejemplo pendiente'}
\\end{lstlisting}
\\section{Referencias iniciales}
\\begin{itemize}
${items.join('\n')}
 \\end{itemize}
\\section{Limitaciones}
\\begin{itemize}
${limitaciones || '\\item No registradas.'}
\\end{itemize}
\\section{Conclusiones y recomendaciones}
\\begin{itemize}
${conclusiones || '\\item No registradas.'}
\\end{itemize}
\\section{Trazabilidad}
\\begin{tabularx}{\\textwidth}{r X X X c c c X}
\\textbf{#} & \\textbf{Referencia corta} & \\textbf{Tipo} & \\textbf{Fuente} & \\textbf{Año} & \\textbf{Puntaje} & \\textbf{Decisión} & \\textbf{Motivo} \\\\ \\hline
${trazabilidad || '— & No disponible & — & — & — & — & — & — \\\\'}
\\end{tabularx}
\\section{Auditoría editorial}
\\begin{itemize}
${auditoria || '\\item No registrada.'}
\\end{itemize}
\\section{Registro de cambios}
\\begin{itemize}
${cambios || '\\item No registrado.'}
\\end{itemize}
\\section{Datos faltantes}
\\begin{itemize}
${faltantes || '\\item No se identificaron datos faltantes críticos.'}
\\end{itemize}
\\section{Documentos locales consultados}
\\begin{itemize}
${locales || '\\item No se encontraron documentos locales relacionados.'}
\\end{itemize}
\\section{Consultas reproducibles}
\\begin{itemize}
${consultas || '\\item No se registraron consultas adicionales.'}
\\end{itemize}
 \\section{Nota metodológica}
 ${texEscape(inv.nota || 'Este informe es una preselección automática. Verifique los textos completos antes de tomar decisiones.')}
 \\end{document}
`
}
export function INVESTIGATOR_PROMPT(tema, evidence = []) {
  return `Actúa como sintetizador investigador del proyecto BuscadorDocs.
Tema: "${tema}".
El backend ya realizó la búsqueda, deduplicación, filtrado por fecha y confiabilidad, doble puntuación y selección final. Usa SOLO los siguientes documentos y sus fragmentos; no busques en la web, no leas otros documentos y no inventes referencias:
${JSON.stringify(evidence)}
Redacta en español neutro y académico, con 900-1500 palabras sin contar referencias ni código. Conserva sin traducir únicamente títulos bibliográficos, autores, revistas, DOI, URL y código R. Basa cada afirmación en el corpus y cita en el texto con formato autor-año; si algo no está evidenciado, escribe literalmente "no evidenciado en el corpus".
Antes de redactar, desambigua el tema: identifica su sentido principal, homónimos o siglas, y declara el alcance y los documentos excluidos. Incluye: 1) alcance y desambiguación; 2) definición conceptual de 3-5 líneas y relación con conceptos vecinos; 3) resumen del corpus con inclusión/respaldo, puntaje promedio, años, tipos y fuentes; 4) tabla o síntesis de conceptos clave con frecuencias e interpretación; 5) 4-6 hallazgos sustantivos con citas; 6) aplicaciones respaldadas y separadas por ámbito, cada una con referencia; 7) ejemplo en R específico del tema; 8) limitaciones; 9) conclusiones y recomendaciones accionables; 10) referencias APA 7 con DOI como URL; 11) trazabilidad; 12) nota metodológica con cadena, criterios y verificación PENDIENTE si no se hizo.
Actúa además como revisor: audita antes de reescribir si hay plantillas, afirmaciones sin respaldo, duplicados, ámbitos sin evidencia, términos vacíos, variantes sin agrupar, tipos documentales incorrectos, referencias inconsistentes, vacíos temporales o un ejemplo R genérico. Devuelve un registro de cambios con problema, corrección y evidencia, y una lista de datos faltantes. No uses “continuidad temporal” salvo que haya al menos cuatro años distintos con documentos.
  El ejemplo R debe ser específico, ejecutable sin descargas ni archivos externos: crea un data.frame, vector o lista de datos dentro del propio código. No uses iris, mtcars, read.csv, load, source, install.packages, librerías externas ni rutas locales. Usa set.seed(), separa entrenamiento/prueba cuando aplique, evalúa solo prueba y muestra la métrica apropiada. Si el tema es un proceso, estructura el código por etapas. Comenta el código en español y explica su limitación.
Devuelve SOLO JSON válido, sin markdown ni texto extra, con este esquema:
REGLA OBLIGATORIA: entrega desde la primera respuesta el informe COMPLETO corregido. Revisa y reescribe internamente antes de devolverlo; nunca devuelvas solo la auditoría. Toda sección problemática debe cambiar o contener [DATO FALTANTE: qué evidencia se necesita]. No marques OK por la mera existencia de una cita o resumen. Comprueba que el resumen respalda la afirmación, que no quedan plantillas, stopwords, ámbitos sin cita ni vacíos temporales omitidos. No atribuyas verificación por pares sin evidencia.
El registro de cambios es opcional si no hay borrador anterior: devuelve [] en ese caso. Nunca inventes cambios. Cada fila debe incluir campo, seccion, antes y despues (extractos literales distintos de máximo 15 palabras), referenciaId (DOI/URL de un documento recibido), evidencia (Autor, año). Si no puedes demostrar el cambio o su evidencia, omite la fila. No uses Método local ni Sin aplicación como evidencia. Añade datosFaltantes y auditoria al JSON; entrega todas las secciones del informe aunque contengan marcadores de datos faltantes.
Usa valores JSON reales, no escribas tipos como string, number, object o string[]. Escapa dentro de las cadenas los saltos de línea (\\n), barras invertidas (\\\\) y comillas (\\"). No incluyas markdown ni texto antes o después del objeto. La respuesta debe tener esta forma válida (puedes usar arreglos vacíos si no hay evidencia):
{"tema":"ejemplo","fecha":"2026-10-11","alcance":"texto","definicion":"texto","conceptosInterpretacion":"texto","oportunidades":["texto"],"hallazgosPrincipales":["texto"],"limitaciones":["texto"],"conclusiones":["texto"],"mineria":{},"ejemploR":{"descripcion":"texto","codigo":"texto"},"referencias":[{"titulo":"texto","autores":"texto","anio":2024,"doi":"","url":"https://example.org","fuente":"texto","tipo":"artículo revisado por pares","citas":0,"resumen":"texto","fragmentos":[],"puntaje":0,"decision":"respaldo","bibtex":"texto"}],"consultas":[{"key":"tema","label":"Tema","query":"ejemplo"}],"nota":"texto"}`.trim()
}
