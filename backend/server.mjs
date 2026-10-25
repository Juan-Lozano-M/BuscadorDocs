// Backend API para BuscadorDocs — replica unidad-1/busquedas/busqueda_general.md
// Arquitectura: React -> Backend API -> OpenRouter + corpus del agente investigador.
//   -> [unidad-1/busquedas/*.md + unidad-1/latex/*.tex + OpenAlex] -> respuesta estructurada -> React.
//
// Rutas:
//   GET  /api/buscar?q=tema        -> búsqueda rápida OpenAlex + puntaje 80/100 (sin LLM).
//   POST /api/investigar {tema, modo} -> agente investigador completo.
//     modo 'local' (defecto): agent.mjs directo, determinista.
//     modo 'openrouter': API directa con salida JSON; 'opencode' se acepta como alias antiguo.
//   POST /api/guardar-latex {investigacion} -> genera el .tex y lo sube a Supabase Storage.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { investigar, analyzeTopic, buildEvidence, mineReferences, INVESTIGATOR_PROMPT, buildLatex, slugify } from './agent.mjs'
import { finalizeReport } from './report-review.mjs'
import { requestReport } from './openrouter-report.mjs'
import { listSavedTex, uploadTex } from './supabase.mjs'
import { analyzeCsv, profileCsv } from './analysis.mjs'

// Carga .env mínimo (sin dependencias)
try {
  for (const line of fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* sin .env: solo fallará /api/guardar-latex */ }

const PORT = process.env.PORT || 3001

const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function detectRscript() {
  const candidates = []
  if (process.env.RSCRIPT_BIN) candidates.push(process.env.RSCRIPT_BIN)
  if (process.platform === 'win32') {
    for (const root of ['C:\\Program Files\\R', 'C:\\Program Files\\R\\bin']) {
      try {
        const folders = fs.readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(root, entry.name))
        for (const folder of folders) {
          candidates.push(path.join(folder, 'bin', 'Rscript.exe'))
          candidates.push(path.join(folder, 'bin', 'x64', 'Rscript.exe'))
        }
      } catch { /* la carpeta puede no existir */ }
    }
    candidates.push('C:\\Program Files\\R\\bin\\Rscript.exe')
  }
  candidates.push('Rscript')
  return candidates.find((candidate) => candidate === 'Rscript' || fs.existsSync(candidate))
}

const RSCRIPT_BIN = detectRscript()

function executeR(code) {
  const forbidden = /\b(?:system|system2|shell|source|download\.file|install\.packages|remove\.packages|unlink|file\.remove|setwd|read\.(?:csv|csv2|rds|RDS)|load|url|socketConnection|write\.(?:csv|table)|saveRDS)\s*\(/i
  if (!code.trim()) throw new Error('El código R está vacío.')
  if (code.length > 30000) throw new Error('El código R supera el límite de 30.000 caracteres.')
  if (forbidden.test(code)) throw new Error('Este ejemplo intenta leer, descargar o modificar archivos. Usa datos creados dentro del código.')
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buscadordocs-r-'))
    const script = path.join(dir, 'ejemplo.R')
    fs.writeFileSync(script, code, 'utf8')
    const rEnv = {
      ...process.env,
      LANG: 'C',
      LC_ALL: 'C',
      LC_COLLATE: 'C',
      LC_CTYPE: 'C',
      LC_MONETARY: 'C',
      LC_TIME: 'C',
    }
    execFile(RSCRIPT_BIN, ['--vanilla', script], { cwd: dir, env: rEnv, encoding: 'buffer', timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* limpieza temporal */ }
      const decodeR = (value) => Buffer.isBuffer(value)
        ? value.toString('utf8')
        : String(value || '')
      const output = decodeR(stdout)
      const warning = decodeR(stderr)
      if (error) {
        if (error.code === 'ENOENT') return reject(new Error('Rscript no está instalado o no está disponible en el PATH del backend.'))
        if (error.killed) return reject(new Error('La ejecución de R superó el límite de 20 segundos.'))
        return reject(new Error((warning || output || error.message).trim().slice(0, 4000)))
      }
      resolve({ salida: output.trim(), advertencia: warning.trim() })
    })
  })
}

async function chatMiningAssistant(message, history = []) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('Falta OPENROUTER_API_KEY en backend/.env')
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'BuscadorDocs - Chat de mineria de datos' },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: 'openrouter/free', temperature: 0.2, max_tokens: 700, reasoning: { effort: 'low', exclude: true },
      messages: [
        { role: 'system', content: 'Eres un tutor conciso especializado exclusivamente en minería de datos, análisis de datos, aprendizaje automático aplicado, estadística para datos, bases de datos analíticas y visualización. Responde siempre en español. Devuelve únicamente la respuesta final para el usuario: jamás muestres razonamientos internos, análisis paso a paso, planes, deliberaciones ni frases como “thinking process”. Contesta en 2 a 6 párrafos breves o una lista corta. Si el usuario pide un ejemplo de R, entrega código ejecutable, comentado en español y una explicación de máximo 3 líneas. Si pregunta algo ajeno al área, responde: “Puedo ayudarte únicamente con minería de datos y temas relacionados.” No inventes resultados ni fuentes; aclara cuando falten datos.' },
        ...history.filter((item) => ['user', 'assistant'].includes(item.role)).slice(-8),
        { role: 'user', content: message },
      ],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `OpenRouter ${response.status}`)
  const answer = sanitizeChatAnswer(payload.choices?.[0]?.message?.content || '')
  return answer || chatFallback(message)
}

function chatFallback(message) {
  if (/\breact\b|javascript|frontend|front-end/i.test(message)) {
    return 'React es una biblioteca de JavaScript, no de R. Para construir una interfaz de análisis en R puedes usar Shiny. Los ejemplos estadísticos del proyecto crean sus datos en memoria para poder ejecutarse directamente, sin cargar datasets externos.'
  }
  return 'Puedo ayudarte con minería de datos, análisis, modelos, métricas y ejemplos en R. Formula una pregunta concreta sobre alguno de esos temas.'
}

function sanitizeChatAnswer(value) {
  let answer = String(value).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim()
  const finalMarker = answer.match(/(?:respuesta final|final answer)\s*:\s*/i)
  if (finalMarker) answer = answer.slice(finalMarker.index + finalMarker[0].length).trim()
  if (/thinking process|razonamiento interno|analizar la entrada|check constraints|determine response strategy/i.test(answer)) {
    return 'Puedo ayudarte con minería de datos, análisis, modelos, métricas y ejemplos en R. ¿Qué tema quieres revisar?'
  }
  return answer
}

function abstractFromIndex(idx) {
  if (!idx) return ''
  const words = []
  for (const [w, positions] of Object.entries(idx)) {
    for (const p of positions) words[p] = w
  }
  return words.join(' ')
}

function scoreWork(work, terms) {
  const title = norm(work.title || '')
  const abs = norm(abstractFromIndex(work.abstract_inverted_index))
  const text = `${title} ${abs}`
  const has = (list) => list.some((k) => text.includes(norm(k)))

  // 1. Coincidencia temática 0-30
  const matched = terms.filter((t) => text.includes(t)).length
  const tematica = terms.length ? Math.round((matched / terms.length) * 30) : 0

  // 2. Unidad 0-20
  const unidadKeys = ['data mining', 'mineria de datos', 'business', 'empresarial', 'decision', 'analytics', 'analitica', 'application', 'aplicacion']
  const unidadHits = unidadKeys.filter((k) => text.includes(norm(k))).length
  const unidad = Math.min(20, unidadHits * 5)

  // 3. Calidad 0-15: revista/conferencia + citas
  const cites = work.cited_by_count || 0
  const isJournal = Boolean(work.primary_location?.source?.id)
  const calidad = Math.min(15, (isJournal ? 8 : 3) + Math.min(7, Math.floor(cites / 20)))

  // 4. Método 0-15
  const metodoKeys = ['method', 'metod', 'framework', 'model', 'algorithm', 'algoritmo', 'evaluation', 'validation', 'validacion', 'metric']
  const metodoHits = metodoKeys.filter((k) => text.includes(norm(k))).length
  const metodo = Math.min(15, metodoHits * 4)

  // 5. Actualidad 0-10
  const year = work.publication_year || 0
  const actualidad = year >= 2015 ? 10 : year >= 2000 ? 4 : 2

  // 6. Aplicabilidad 0-10
  const aplicaKeys = ['dataset', 'result', 'resultado', 'implementation', 'implementacion', 'example', 'ejemplo', 'case study', 'estudio de caso', 'data ']
  const aplicaHits = aplicaKeys.filter((k) => text.includes(norm(k))).length
  const aplicabilidad = Math.min(10, aplicaHits * 3)

  const total = tematica + unidad + calidad + metodo + actualidad + aplicabilidad
  const decision = total >= 80 ? 'incluir' : total >= 60 ? 'respaldo' : 'excluir'
  return { tematica, unidad, calidad, metodo, actualidad, aplicabilidad, total, decision, _hasMethod: has(metodoKeys) }
}

async function buscar(tema) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(tema)}&filter=from_publication_date:2015-01-01&per-page=20&select=id,doi,title,authorships,publication_year,primary_location,cited_by_count,abstract_inverted_index,open_access`
  let res
  for (let intento = 0; intento < 3; intento++) {
    res = await fetch(url, { headers: { 'User-Agent': 'BuscadorDocs/0.1 (mailto:local@dev)' } })
    if (res.status !== 429) break
    await new Promise((r) => setTimeout(r, 1500 * (intento + 1)))
  }
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`)
  const data = await res.json()
  const terms = norm(tema).split(/\s+/).filter((t) => t.length > 2)
  const seen = new Set()
  const resultados = []
  for (const w of data.results || []) {
    const doi = w.doi || w.id
    if (seen.has(doi)) continue
    seen.add(doi)
    const s = scoreWork(w, terms)
    const autores = (w.authorships || []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean).join(', ')
    resultados.push({
      titulo: w.title,
      autores,
      anio: w.publication_year,
      doi: w.doi,
      url: w.doi || w.id,
      fuente: w.primary_location?.source?.display_name || 'OpenAlex',
      citas: w.cited_by_count || 0,
      resumen: abstractFromIndex(w.abstract_inverted_index).slice(0, 600),
      puntaje: s.total,
      desglose: { tematica: s.tematica, unidad: s.unidad, calidad: s.calidad, metodo: s.metodo, actualidad: s.actualidad, aplicabilidad: s.aplicabilidad },
      decision: s.decision,
    })
  }
  resultados.sort((a, b) => b.puntaje - a.puntaje)
  return { tema, fecha: new Date().toISOString().slice(0, 10), fuente: 'OpenAlex', total: resultados.length, resultados }
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function runOpenRouter(tema, signal) {
  const evidence = await buildEvidence(tema)
  if (!evidence.references.length) throw new Error('No se recuperó evidencia bibliográfica para este tema. Verifica la conexión con OpenAlex y vuelve a intentarlo.')
  const mineria = mineReferences(evidence.references, tema)
  const prompt = INVESTIGATOR_PROMPT(tema, evidence.references) + '\nConteos calculados sobre el corpus: ' + JSON.stringify(mineria)
  const { draft, model } = await requestReport(prompt, {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || undefined,
    signal
  })
  return finalizeReport({ ...draft, tema, fecha: new Date().toISOString().slice(0, 10), mineria, referencias: evidence.references, pipeline: evidence.pipeline, modelo: model })
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (u.pathname === '/api/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, proveedorInformes: 'openrouter' }))
    return
  }
  if (u.pathname === '/api/temas-guardados' && req.method === 'GET') {
    try {
      const out = await listSavedTex()
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String(e.message || e) }))
    }
    return
  }
  if (u.pathname === '/api/datasets/profile' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 5 * 1024 * 1024) || '{}')
      const out = profileCsv(String(body.content || ''), String(body.filename || 'dataset.csv'))
      delete out.parsed
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String(e.message || e) }))
    }
    return
  }
  if (u.pathname === '/api/experiments' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 5 * 1024 * 1024) || '{}')
      const out = analyzeCsv(String(body.content || ''), { filename: String(body.filename || 'dataset.csv'), method: body.method, target: body.target, k: body.k })
      delete out.profile.parsed
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String(e.message || e) }))
    }
    return
  }
  if (u.pathname === '/api/topic-analysis' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 64 * 1024) || '{}')
      const out = await analyzeTopic(String(body.tema || ''))
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: String(e.message || e) }))
    }
    return
  }
  if (u.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 48 * 1024) || '{}')
      const message = String(body.message || '').trim()
      if (!message) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Escribe una pregunta sobre minería de datos' })); return }
      const answer = await chatMiningAssistant(message, Array.isArray(body.history) ? body.history : [])
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ answer }))
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: `No se pudo responder: ${String(e.message || e)}` }))
    }
    return
  }
  if (u.pathname === '/api/ejecutar-r' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 40 * 1024) || '{}')
      const result = await executeR(String(body.codigo || ''))
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, ...result }))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }))
    }
    return
  }
  if (u.pathname === '/api/buscar') {
    const q = (u.searchParams.get('q') || '').trim()
    if (q.length < 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Parámetro q mínimo 3 caracteres' }))
      return
    }
    try {
      const out = await buscar(q)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(out))
    } catch (e) {
      // Degradar con gracia: OpenAlex puede limitar (429) o fallar; el front muestra el aviso
      // y el protocolo manual sigue disponible.
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ tema: q, fecha: new Date().toISOString().slice(0, 10), fuente: 'OpenAlex', total: 0, resultados: [], advertencia: `Búsqueda web no disponible: ${e.message || e}. Usa el protocolo manual.` }))
    }
    return
  }
  if (u.pathname === '/api/investigar' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}')
      const tema = String(body.tema || '').trim()
      const modo = String(body.modo || 'local')
      if (tema.length < 3) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Tema mínimo 3 caracteres' })); return }
      const remote = modo === 'openrouter' || modo === 'opencode' // Compatibilidad con pestañas anteriores.
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', cancel)
      let out
      try { out = remote ? await runOpenRouter(tema, controller.signal) : await investigar(tema) }
      finally { res.off('close', cancel) }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ...out, modo: remote ? 'openrouter' : 'local' }))
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(e.message || e) }))
    }
    return
  }
  if (u.pathname === '/api/guardar-latex' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 512 * 1024) || '{}')
      const inv = body.investigacion
      if (!inv?.tema || !inv?.ejemploR) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Falta investigacion válida (ejecuta Investigar primero)' })); return }
      const filename = `${slugify(inv.tema)}.tex`
      const tex = buildLatex(finalizeReport(inv, { local: inv.modo === 'local' }))
      const up = await uploadTex(filename, tex)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, filename, ...up }))
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `No se pudo guardar el informe: ${String(e.message || e)}` }))
    }
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'No encontrado' }))
})

server.listen(PORT, () => console.log(`BuscadorDocs API en http://localhost:${PORT}`))
