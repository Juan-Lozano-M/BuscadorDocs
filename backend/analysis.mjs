const MAX_ROWS = 20000

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') { value += '"'; i += 1; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (!quoted && char === delimiter) { row.push(value.trim()); value = ''; continue }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1
      row.push(value.trim()); value = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      continue
    }
    value += char
  }
  if (value || row.length) { row.push(value.trim()); if (row.some((cell) => cell !== '')) rows.push(row) }
  if (rows.length < 2) throw new Error('El CSV debe tener encabezados y al menos una fila')
  const rawHeaders = rows.shift().map((header, index) => header.replace(/^\uFEFF/, '') || `columna_${index + 1}`)
  const used = new Map()
  const headers = rawHeaders.map((header) => {
    const count = used.get(header) || 0
    used.set(header, count + 1)
    return count ? `${header}_${count + 1}` : header
  })
  return { headers, rows: rows.slice(0, MAX_ROWS).map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']))) }
}

function numericValue(value) {
  if (value === '' || value == null) return null
  const normalized = String(value).replace(/\s/g, '').replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 }

function profileColumn(rows, name) {
  const values = rows.map((row) => row[name] ?? '')
  const present = values.filter((value) => value !== '')
  const numeric = present.map(numericValue)
  const isNumeric = present.length > 0 && numeric.filter((value) => value !== null).length / present.length >= 0.8
  const missing = values.length - present.length
  const unique = new Set(present).size
  if (isNumeric) {
    const nums = numeric.filter((value) => value !== null).sort((a, b) => a - b)
    return { name, type: 'numeric', missing, missingPercent: Math.round((missing / rows.length) * 100), unique, min: nums[0], max: nums[nums.length - 1], mean: Number(mean(nums).toFixed(3)), median: nums[Math.floor(nums.length / 2)] }
  }
  const counts = new Map()
  present.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }))
  return { name, type: 'categorical', missing, missingPercent: Math.round((missing / rows.length) * 100), unique, top }
}

function correlation(rows, a, b) {
  const pairs = rows.map((row) => [numericValue(row[a]), numericValue(row[b])]).filter(([x, y]) => x !== null && y !== null)
  if (pairs.length < 3) return null
  const xMean = mean(pairs.map(([x]) => x)); const yMean = mean(pairs.map(([, y]) => y))
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0)
  const denominator = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0) * pairs.reduce((sum, [, y]) => sum + (y - yMean) ** 2, 0))
  return denominator ? Number((numerator / denominator).toFixed(3)) : 0
}

export function profileCsv(text, filename = 'dataset.csv') {
  if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) throw new Error('El archivo debe ser CSV y pesar menos de 5 MB')
  const parsed = parseCsv(text)
  const columns = parsed.headers.map((name) => profileColumn(parsed.rows, name))
  const duplicateCount = parsed.rows.length - new Set(parsed.rows.map((row) => JSON.stringify(row))).size
  const missingCells = columns.reduce((sum, column) => sum + column.missing, 0)
  const totalCells = parsed.rows.length * columns.length
  const quality = Math.max(0, Math.round(100 - (missingCells / Math.max(1, totalCells)) * 55 - (duplicateCount / Math.max(1, parsed.rows.length)) * 30))
  return { filename, rows: parsed.rows.length, columns: columns.length, headers: parsed.headers, columnsInfo: columns, duplicateRows: duplicateCount, missingCells, quality, preview: parsed.rows.slice(0, 5), parsed }
}

function kmeans(rows, columns, k) {
  const matrix = rows.map((row) => columns.map((column) => numericValue(row[column.name]))).filter((values) => values.every((value) => value !== null))
  if (matrix.length < k) throw new Error(`Se necesitan al menos ${k} filas completas para segmentar`)
  const means = columns.map((_, i) => mean(matrix.map((row) => row[i])))
  const deviations = columns.map((_, i) => Math.sqrt(mean(matrix.map((row) => (row[i] - means[i]) ** 2))) || 1)
  const scaled = matrix.map((row) => row.map((value, i) => (value - means[i]) / deviations[i]))
  let centers = scaled.slice(0, k).map((row) => [...row])
  let labels = []
  for (let iteration = 0; iteration < 30; iteration += 1) {
    labels = scaled.map((row) => centers.reduce((best, center, index) => {
      const distance = row.reduce((sum, value, i) => sum + (value - center[i]) ** 2, 0)
      return distance < best.distance ? { index, distance } : best
    }, { index: 0, distance: Infinity }).index)
    const next = centers.map((center, index) => {
      const members = scaled.filter((_, rowIndex) => labels[rowIndex] === index)
      return members.length ? center.map((_, i) => mean(members.map((row) => row[i]))) : center
    })
    if (JSON.stringify(next) === JSON.stringify(centers)) break
    centers = next
  }
  return { labels, centers: centers.map((center) => Object.fromEntries(columns.map((column, i) => [column.name, Number(center[i].toFixed(2))]))), counts: centers.map((_, index) => labels.filter((label) => label === index).length), rowsUsed: matrix.length }
}

function supervisedModel(rows, target, numericColumns, method) {
  const targetInfo = profileColumn(rows, target)
  const features = numericColumns.filter((column) => column.name !== target)
  if (!targetInfo || !features.length) throw new Error('Selecciona una variable objetivo y al menos una variable numérica explicativa')
  const usable = rows.map((row, index) => ({ index, values: features.map((feature) => numericValue(row[feature.name])), target: method === 'regression' ? numericValue(row[target]) : row[target] })).filter((item) => item.values.every((value) => value !== null) && item.target !== null && item.target !== '')
  if (usable.length < 6) throw new Error('Se necesitan al menos 6 filas completas para entrenar y evaluar el modelo')
  const split = Math.max(3, Math.floor(usable.length * 0.8))
  const train = usable.slice(0, split); const test = usable.slice(split)
  if (method === 'regression') {
    const featureScores = features.map((feature, i) => ({ feature, value: Math.abs(correlation(rows, feature.name, target)) || 0, index: i })).sort((a, b) => b.value - a.value)
    const selected = featureScores[0]
    const xMean = mean(train.map((item) => item.values[selected.index])); const yMean = mean(train.map((item) => item.target))
    const slope = train.reduce((sum, item) => sum + (item.values[selected.index] - xMean) * (item.target - yMean), 0) / (train.reduce((sum, item) => sum + (item.values[selected.index] - xMean) ** 2, 0) || 1)
    const intercept = yMean - slope * xMean
    const predict = (item) => intercept + slope * item.values[selected.index]
    const predictions = test.map((item) => ({ actual: item.target, predicted: predict(item) }))
    const mae = mean(predictions.map(({ actual, predicted }) => Math.abs(actual - predicted)))
    const rmse = Math.sqrt(mean(predictions.map(({ actual, predicted }) => (actual - predicted) ** 2)))
    const totalVariance = test.reduce((sum, item) => sum + (item.target - mean(test.map((entry) => entry.target))) ** 2, 0) || 1
    const r2 = 1 - predictions.reduce((sum, item) => sum + (item.actual - item.predicted) ** 2, 0) / totalVariance
    return { title: `Predicción de ${target}`, explanation: `Se entrenó una regresión lineal simple usando ${selected.feature.name}, la variable numérica con mayor relación con ${target}.`, metrics: [{ label: 'MAE', value: mae.toFixed(2) }, { label: 'RMSE', value: rmse.toFixed(2) }, { label: 'R²', value: r2.toFixed(2) }], predictions: predictions.slice(0, 8).map((item) => ({ actual: Number(item.actual.toFixed(2)), predicted: Number(item.predicted.toFixed(2)) })), selectedFeature: selected.feature.name }
  }
  const labels = [...new Set(train.map((item) => item.target))].slice(0, 12)
  const baseline = labels.sort((a, b) => train.filter((item) => item.target === b).length - train.filter((item) => item.target === a).length)[0]
  const candidates = features.flatMap((feature, featureIndex) => {
    const values = [...new Set(train.map((item) => item.values[featureIndex]))].sort((a, b) => a - b)
    return values.slice(0, -1).map((value, i) => ({ feature, featureIndex, threshold: (value + values[i + 1]) / 2 }))
  })
  const accuracy = (candidate) => train.filter((item) => item.target === (item.values[candidate.featureIndex] <= candidate.threshold ? labels[0] : labels[1] || labels[0])).length / train.length
  const model = candidates.sort((a, b) => accuracy(b) - accuracy(a))[0]
  if (!model || labels.length < 2) throw new Error('La clasificación requiere una variable objetivo categórica con al menos dos clases')
  const predict = (item) => item.values[model.featureIndex] <= model.threshold ? labels[0] : labels[1]
  const correct = test.filter((item) => predict(item) === item.target).length
  const testAccuracy = correct / test.length
  return { title: `Clasificación de ${target}`, explanation: `Se construyó un clasificador interpretable usando ${model.feature.name} y un umbral de ${model.threshold.toFixed(2)}.`, metrics: [{ label: 'Accuracy', value: `${(testAccuracy * 100).toFixed(1)}%` }, { label: 'Base', value: `${(train.filter((item) => item.target === baseline).length / train.length * 100).toFixed(1)}%` }, { label: 'Filas prueba', value: test.length }], predictions: test.slice(0, 8).map((item) => ({ actual: item.target, predicted: predict(item) })), selectedFeature: model.feature.name }
}

const TEXT_STOPWORDS = new Set('about after again also among and are article been between could data from have into more most other results study such than that the their them these they this through using were what which with your para como desde entre sobre una uno unos unas los las del por sus que con este esta estos estas más mas un una y o de en al se es por lo para también tambien como son fue han según segun este esta estos estas puede pueden proceso método metodo análisis analisis aplicación aplicacion resultados paper based use using'.split(/\s+/))

function tokenizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z][a-z-]{3,}/g)?.filter((word) => !TEXT_STOPWORDS.has(word)) || []
}

function analyzeDocumentCorpus(data) {
  const rows = data.parsed.rows
  const documents = rows.map((row) => tokenizeText(`${row.titulo || ''} ${row.resumen || ''}`))
  const termFrequency = new Map()
  const documentFrequency = new Map()
  documents.forEach((terms) => {
    const unique = new Set(terms)
    terms.forEach((term) => termFrequency.set(term, (termFrequency.get(term) || 0) + 1))
    unique.forEach((term) => documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1))
  })
  const topTerms = [...termFrequency.entries()].map(([term, frecuencia]) => ({ term, frecuencia, documentos: documentFrequency.get(term) || 0, tfidf: Number((frecuencia * Math.log((rows.length + 1) / ((documentFrequency.get(term) || 0) + 1))).toFixed(3)) })).sort((a, b) => b.tfidf - a.tfidf || b.frecuencia - a.frecuencia).slice(0, 20)
  const years = [...new Set(rows.map((row) => row.anio).filter(Boolean))].sort().map((year) => ({ year, count: rows.filter((row) => row.anio === year).length }))
  const sources = [...new Map(rows.map((row) => [row.fuente || 'Fuente no identificada', rows.filter((item) => (item.fuente || 'Fuente no identificada') === (row.fuente || 'Fuente no identificada')).length])).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([fuente, count]) => ({ fuente, count }))
  const pairs = new Map()
  documents.forEach((terms) => [...new Set(terms.filter((term) => topTerms.some((item) => item.term === term)))].slice(0, 8).forEach((term, index, selected) => selected.slice(index + 1).forEach((other) => { const key = [term, other].sort().join(' · '); pairs.set(key, (pairs.get(key) || 0) + 1) })))
  const coocurrencias = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([relacion, frecuencia]) => ({ relacion, frecuencia }))
  const insights = [
    `Se analizaron ${rows.length} documentos y ${termFrequency.size} términos no vacíos en títulos y resúmenes.`,
    topTerms.length ? `Los términos con mayor peso TF-IDF son: ${topTerms.slice(0, 6).map((item) => item.term).join(', ')}.` : 'No hay texto suficiente para extraer términos.',
    years.length > 1 ? `La cobertura documental va de ${years[0].year} a ${years.at(-1).year}.` : 'La muestra no permite comparar una evolución temporal amplia.',
  ]
  return { title: 'Minería textual del corpus', explanation: 'Se limpiaron títulos y resúmenes, se excluyeron palabras vacías y se priorizaron términos por frecuencia documental y TF-IDF.', insights, textMining: { topTerms, years, sources, coocurrencias }, correlations: [] }
}

export function analyzeCsv(text, options = {}) {
  const data = profileCsv(text, options.filename)
  const numericColumns = data.columnsInfo.filter((column) => column.type === 'numeric')
  const method = options.method || 'explore'
  const insights = []
  const missingColumn = data.columnsInfo.find((column) => column.missingPercent > 0)
  if (missingColumn) insights.push(`${missingColumn.name} tiene ${missingColumn.missingPercent}% de valores faltantes; conviene imputar o justificar su ausencia.`)
  if (data.duplicateRows) insights.push(`Se detectaron ${data.duplicateRows} filas duplicadas que pueden sesgar los resultados.`)
  if (!missingColumn && !data.duplicateRows) insights.push('No se detectaron faltantes ni duplicados en la muestra analizada.')
  let result = { method, insights, correlations: [] }
  if (method === 'text-mining') {
    result = { ...result, ...analyzeDocumentCorpus(data) }
  } else if (method === 'cluster') {
    if (numericColumns.length < 2) throw new Error('El clustering requiere al menos dos columnas numéricas')
    const k = Math.min(6, Math.max(2, Number(options.k) || 3))
    const clustering = kmeans(data.parsed.rows, numericColumns.slice(0, 6), k)
    result = { ...result, ...clustering, title: `Segmentación en ${k} perfiles`, explanation: 'Se estandarizaron las variables numéricas y se agruparon filas con comportamiento parecido mediante k-means.' }
  } else if (method === 'anomaly') {
    const scored = data.parsed.rows.map((row, index) => {
      const values = numericColumns.map((column) => numericValue(row[column.name])).filter((value) => value !== null)
      return { row: index + 1, score: values.length ? Number((values.reduce((sum, value, i) => sum + Math.abs(value - numericColumns[i].mean) / Math.max(1, numericColumns[i].max - numericColumns[i].min), 0) / values.length).toFixed(3)) : 0 }
    }).sort((a, b) => b.score - a.score)
    result = { ...result, title: 'Registros con comportamiento atípico', anomalies: scored.slice(0, 10), explanation: 'Se priorizaron filas alejadas del rango habitual de las variables numéricas.' }
  } else if (method === 'regression' || method === 'classification') {
    const supervised = supervisedModel(data.parsed.rows, String(options.target || ''), numericColumns, method)
    result = { ...result, ...supervised }
  } else {
    const pairs = []
    numericColumns.slice(0, 5).forEach((a, i) => numericColumns.slice(i + 1, 5).forEach((b) => { const value = correlation(data.parsed.rows, a.name, b.name); if (value !== null) pairs.push({ a: a.name, b: b.name, value }) }))
    result = { ...result, title: 'Mapa exploratorio del dataset', correlations: pairs.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8), explanation: 'Se resumen las relaciones lineales más visibles entre las variables numéricas.' }
  }
  return { profile: data, result, codeR: buildRCode(data, method, options) }
}

function buildRCode(data, method, options) {
  const filename = data.filename || 'dataset.csv'
  if (method === 'cluster') return `datos <- read.csv("${filename}")\nnum <- datos[sapply(datos, is.numeric)]\nnum <- scale(num)\nmodelo <- kmeans(num, centers = ${Number(options.k) || 3}, nstart = 20)\ndatos$cluster <- modelo$cluster\naggregate(num, by = list(cluster = modelo$cluster), FUN = mean)`
  if (method === 'anomaly') return `datos <- read.csv("${filename}")\nnum <- datos[sapply(datos, is.numeric)]\nz <- scale(num)\ndatos$indice_atipicidad <- rowMeans(abs(z), na.rm = TRUE)\nhead(datos[order(-datos$indice_atipicidad), ], 10)`
  if (method === 'regression') return `datos <- read.csv("${filename}")\nset.seed(42)\nidx <- sample(seq_len(nrow(datos)), floor(.8 * nrow(datos)))\ntrain <- datos[idx, ]\ntest <- datos[-idx, ]\nmodelo <- lm(${options.target || 'objetivo'} ~ ., data = train)\nsummary(modelo)\npred <- predict(modelo, test)\nmean(abs(pred - test$${options.target || 'objetivo'}))`
  if (method === 'classification') return `datos <- read.csv("${filename}")\ndatos$${options.target || 'objetivo'} <- as.factor(datos$${options.target || 'objetivo'})\nset.seed(42)\nidx <- sample(seq_len(nrow(datos)), floor(.8 * nrow(datos)))\nmodelo <- rpart::rpart(${options.target || 'objetivo'} ~ ., data = datos[idx, ])\npred <- predict(modelo, datos[-idx, ], type = "class")\nmean(pred == datos[-idx, ]$${options.target || 'objetivo'})`
  if (method === 'text-mining') return `library(dplyr)\nlibrary(tidytext)\nlibrary(tidyr)\n\ndatos <- read.csv("${filename}", sep = ";", encoding = "UTF-8")\nterminos <- datos %>%\n  unite("texto", titulo, resumen, sep = " ", na.rm = TRUE) %>%\n  unnest_tokens(termino, texto) %>%\n  anti_join(stop_words, by = c("termino" = "word")) %>%\n  count(termino, sort = TRUE)\nhead(terminos, 20)`
  return `datos <- read.csv("${filename}")\nstr(datos)\nsummary(datos)\ncor(datos[sapply(datos, is.numeric)], use = "pairwise.complete.obs")`
}
