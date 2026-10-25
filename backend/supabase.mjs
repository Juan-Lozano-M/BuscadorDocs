// Subida a Supabase Storage vía API REST (sin dependencias).
// Config en .env: SUPABASE_URL, SUPABASE_KEY (service_role recomendado), SUPABASE_BUCKET.
export function supaConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const key = process.env.SUPABASE_KEY || ''
  const bucket = process.env.SUPABASE_BUCKET || 'latex'
  if (!url || !key) throw new Error('Falta SUPABASE_URL o SUPABASE_KEY en .env')
  return { url, key, bucket }
}

export async function uploadTex(filename, tex) {
  const { url, key, bucket } = supaConfig()
  const path = `unidad-1/${filename}`
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'text/plain; charset=utf-8',
      'x-upsert': 'true',
    },
    body: tex,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Supabase ${res.status}`)
  return { bucket, path: data.Key || `${bucket}/${path}`, publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}` }
}

export async function listSavedTex() {
  const { url, key, bucket } = supaConfig()
  const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: 'unidad-1/', limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  })
  const data = await res.json().catch(() => [])
  if (!res.ok) throw new Error(data.message || data.error || `Supabase ${res.status}`)

  const files = (Array.isArray(data) ? data : [])
    .filter((item) => item.name?.toLowerCase().endsWith('.tex'))
    .map((item) => ({
      filename: item.name,
      path: `unidad-1/${item.name}`,
      updatedAt: item.updated_at || item.created_at || null,
    }))

  const documents = await Promise.all(files.map(async (file) => {
    const source = await readTex(file.path)
    return { ...file, source }
  }))
  return { bucket, documents }
}

async function readTex(path) {
  if (!path.startsWith('unidad-1/') || path.includes('..')) throw new Error('Ruta LaTeX inválida')
  const { url, key, bucket } = supaConfig()
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}`)
  return res.text()
}
