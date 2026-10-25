// Prueba manual contra el backend local: no guarda ni modifica informes.
const response = await fetch('http://localhost:3001/api/investigar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tema: process.argv[2] || 'scrum', modo: 'openrouter' }),
  signal: AbortSignal.timeout(220000)
})
const report = await response.json()
console.log(JSON.stringify({ status: response.status, error: report.error, modo: report.modo, modelo: report.modelo, referencias: report.referencias?.length, hallazgos: report.hallazgosPrincipales?.length, definicion: report.definicion?.slice(0, 220), codigoR: Boolean(report.ejemploR?.codigo) }))
if (!response.ok) process.exitCode = 1
