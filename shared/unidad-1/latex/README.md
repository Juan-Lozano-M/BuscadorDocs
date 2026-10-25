# Documentos LaTeX de la Unidad 1

Cada archivo desarrolla uno de los temas de la unidad e incluye un ejemplo en R:

- `mineria_de_datos.tex`
- `kdd.tex`
- `crisp_dm.tex`
- `modelos.tex`
- `modelos_hibridos.tex`
- `prediccion.tex`
- `data_warehouse.tex`

Para compilar un documento cuando LaTeX esté instalado:

```powershell
pdflatex -interaction=nonstopmode mineria_de_datos.tex
```

Los paquetes de R usados en los ejemplos son `rpart` y, en el ejemplo híbrido, `nnet`.

## Incorporación automática a la aplicación

La aplicación Vite lee los archivos `*.tex` de esta carpeta durante el build. Si se agrega un documento nuevo con `\\title{}`, `\\section{Definición}`, `\\section{Aplicaciones}` y un bloque `lstlisting`, se genera automáticamente una entrada adicional en el navegador.

Los siete temas base conservan sus fichas enriquecidas. Los documentos nuevos se incorporan con una ficha genérica que extrae el título, la definición, la aplicación y el código R. Después de agregar un archivo, reiniciar el servidor de desarrollo o ejecutar `npm run build`.
