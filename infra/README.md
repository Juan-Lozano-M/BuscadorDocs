# Infraestructura

La aplicación se divide en dos servicios:

- `frontend`: React/Vite compilado y servido por Nginx en el puerto 5173.
- `backend`: API Node.js en el puerto 3001.

Desde la raíz del proyecto:

```powershell
docker compose up --build
```

El modo OpenCode requiere que el runtime tenga el CLI de OpenCode y su autenticación disponibles. El modo local funciona dentro del contenedor con OpenAlex y los documentos de `shared/`.
