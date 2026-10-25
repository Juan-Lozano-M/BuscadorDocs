# BuscadorDocs · estación de investigación

Aplicación web educativa para explorar temas de minería de datos y recorrer una ruta de investigación basada en evidencia. Conecta documentos bibliográficos, conceptos, análisis de datos, ejemplos reproducibles en R y reportes.

## Qué puedes hacer

- **Inicio y biblioteca:** buscar temas, consultar conceptos y abrir documentos locales.
- **Laboratorio:** preparar y perfilar archivos CSV, revisar calidad y ejecutar experimentos con los datos.
- **Búsqueda bibliográfica:** recuperar y priorizar documentos de OpenAlex para un tema.
- **Análisis y dashboard:** consultar términos frecuentes, cobertura temporal y resumen del corpus recuperado.
- **Atlas:** explorar relaciones entre un tema, conceptos y documentos.
- **Chat rápido:** preguntar en español sobre minería de datos, métodos, métricas o ejemplos en R.
- **Ruta de evidencia:** volver entre etapas de investigación sin imponer un recorrido lineal.
- **Informes:** generar un informe con documentos recuperados y guardarlo como archivo LaTeX en Supabase Storage.
- **Código R:** ejecutar ejemplos desde la interfaz si R está instalado y disponible para el backend.

Los resultados bibliográficos automáticos son una preselección; verifica las fuentes y su texto completo antes de usarlos como evidencia académica.

## Tecnologías

- Interfaz: React, Vite y JavaScript.
- API: Node.js y módulos nativos.
- Recuperación bibliográfica: OpenAlex.
- Generación asistida y chat: OpenRouter.
- Almacenamiento opcional de informes: Supabase Storage.
- Ejecución de ejemplos: R / `Rscript` instalado en el equipo que ejecuta el backend.
- Contenedores: Docker Compose y Nginx para servir la interfaz.

## Requisitos

- Node.js 18 o posterior y npm para desarrollo local.
- R instalado y accesible como `Rscript` para ejecutar código R. Esta función es opcional.
- Docker Desktop / Docker Engine y Docker Compose si se ejecuta en contenedores.
- Credenciales solo para las integraciones que se vayan a usar: OpenRouter para chat e informes asistidos; Supabase para guardar informes.

## Inicio en desarrollo

1. Crea la configuración local del backend a partir de la plantilla:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```

2. Edita `backend/.env` localmente. Completa `OPENROUTER_API_KEY` para usar el chat y la generación de informes con OpenRouter. Completa `SUPABASE_URL`, `SUPABASE_KEY` y `SUPABASE_BUCKET` solo si deseas guardar informes en Supabase. No pongas credenciales en el frontend ni en archivos versionados.

3. En una terminal, inicia el backend:

   ```powershell
   Set-Location backend
   npm start
   ```

4. En otra terminal, instala dependencias e inicia el frontend:

   ```powershell
   Set-Location frontend
   npm ci
   npm run dev
   ```

5. Abre <http://localhost:5173>. El backend escucha en el puerto `3001`; su comprobación de estado está en <http://localhost:3001/api/salud>.

Si no hay credenciales de OpenRouter, las funciones que dependen del modelo no estarán disponibles; la búsqueda bibliográfica y el análisis local se ejecutan por separado. OpenCode es un modo heredado opcional y requiere su CLI autenticado.

## Ejecución con Docker

Docker Compose construye los dos servicios. El backend lee `backend/.env`, así que crea ese archivo antes de levantar los contenedores:

```powershell
Copy-Item backend/.env.example backend/.env
docker compose up --build
```

Interfaz: <http://localhost:5173> · API: <http://localhost:3001>

Para detenerlos, usa `Ctrl+C` y luego `docker compose down` desde la raíz del proyecto.

## Estructura del proyecto

```text
backend/   API, búsqueda, análisis, chat, informes e integración con servicios
frontend/  interfaz React/Vite, estilos y componentes de investigación
shared/    documentos LaTeX y resultados de búsqueda locales
docs/      guía del proyecto
infra/     notas operativas de infraestructura
```

## Seguridad y repositorio

- `backend/.env` y los archivos `.env` están excluidos del control de versiones y del contexto Docker; `backend/.env.example` contiene valores de ejemplo.
- Mantén las claves privadas en el backend. Nunca las incluyas en código del navegador, capturas, informes, commits o este README.
- No subas credenciales, certificados, volcados de bases de datos ni datos personales.
- Si una clave real se expuso, revócala y genera una nueva. Quitarla del último archivo no la elimina del historial Git.
- `impeccable/` y las configuraciones locales comunes de asistentes/skills de IA están excluidas en `.gitignore`; no forman parte de la aplicación.

## Comprobaciones

Construir el frontend:

```powershell
Set-Location frontend
npm ci
npm run build
```

Ejecutar las pruebas automatizadas del proyecto:

```powershell
node --test backend/*.test.mjs frontend/src/*.test.mjs
```
