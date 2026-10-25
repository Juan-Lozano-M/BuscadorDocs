# Búsqueda bibliográfica general: [TEMA]

**Tema indicado:** `[TEMA]`  
**Sinónimos en español:** `[SINÓNIMO 1]`, `[SINÓNIMO 2]`  
**Sinónimos en inglés:** `[ENGLISH TERM 1]`, `[ENGLISH TERM 2]`  
**Fecha de búsqueda:** `[AAAA-MM-DD]`  
**Responsable:** `[NOMBRE]`

## Objetivo

Identificar documentos científicos de calidad que definan, expliquen, apliquen o evalúen **[TEMA]**, priorizando literatura pertinente para la Unidad 1 de minería de datos y ejemplos implementables en R.

## Criterios generales

- Idiomas: español e inglés.
- Periodo recomendado: 2015-2026.
- Conservar trabajos anteriores si son fundacionales para el tema.
- Tipos de documento: artículo revisado por pares, revisión sistemática, capítulo académico o conferencia arbitrada.
- Priorizar documentos con resumen, método, resultados, DOI o URL estable.
- Excluir publicidad, blogs, opiniones, documentos sin autor verificable y resultados donde `[TEMA]` solo aparezca de forma incidental.
- Revisar duplicados por DOI, título y primer autor.

## Consulta principal para Google Scholar

```text
("[TEMA]" OR "[SINÓNIMO 1]" OR "[ENGLISH TERM 1]") AND (definition OR definición OR methodology OR metodología OR application* OR aplicación* OR framework OR marco) AND (data mining OR "minería de datos" OR analytics OR analítica)
```

## Consulta para Scopus o Web of Science

```text
TITLE-ABS-KEY (("[TEMA]" OR "[SINÓNIMO 1]" OR "[ENGLISH TERM 1]") AND (definition OR metodología OR methodology OR application* OR framework*) AND ("data mining" OR "minería de datos" OR analytics OR analítica))
```

## Consulta de revisión sistemática

```text
("[TEMA]" OR "[ENGLISH TERM 1]") AND ("systematic review" OR "literature review" OR "revisión sistemática" OR survey) AND (method* OR framework* OR application*)
```

## Consulta de aplicaciones

```text
("[TEMA]" OR "[ENGLISH TERM 1]") AND (application* OR "case study" OR "estudio de caso" OR empresarial* OR business OR industry OR industrial) AND (result* OR evaluation OR evaluación OR performance)
```

## Consulta de métodos y evaluación

```text
("[TEMA]" OR "[ENGLISH TERM 1]") AND (model* OR algorithm* OR técnica* OR technique* OR method* OR metodología) AND (validation OR validación OR metric* OR métrica* OR comparison OR comparación OR robustness OR robustez)
```

## Consulta de aplicaciones en R

```text
("[TEMA]" OR "[ENGLISH TERM 1]") AND (R OR "R programming" OR "R language" OR CRAN OR tidyverse) AND (example* OR ejemplo* OR implementation OR implementación OR reproducib*)
```

## Consulta de limitaciones y calidad

```text
("[TEMA]" OR "[ENGLISH TERM 1]") AND (limitation* OR limitación* OR challenge* OR desafío* OR bias OR sesgo OR privacy OR privacidad OR ethics OR ética OR explainab* OR interpretab*)
```

## Exclusiones opcionales para Google Scholar

Agregar solo cuando los resultados sean demasiado amplios:

```text
"[TEMA]" -advertising -marketing -blog -news
```

No usar exclusiones si pueden eliminar artículos relevantes para el sector específico del estudio.

## Procedimiento

1. Sustituir todos los campos entre corchetes por el tema indicado y sus sinónimos.
2. Ejecutar la consulta principal en Google Scholar.
3. Ejecutar la consulta `TITLE-ABS-KEY` en Scopus o Web of Science si hay acceso institucional.
4. Ejecutar las consultas de revisión, aplicaciones, evaluación y R.
5. Registrar los primeros resultados pertinentes de cada consulta.
6. Eliminar duplicados por DOI, título y autores.
7. Revisar título y resumen antes de descargar el texto completo.
8. Asignar la puntuación de relevancia.
9. Incluir en la síntesis principal los documentos con 80 puntos o más.
10. Etiquetar el documento con `[CÓDIGO DEL TEMA]`.

## Registro de resultados

| ID | Título | Autores | Año | Base | DOI/URL | Tipo | Citas | Puntaje | Decisión |
|---|---|---|---:|---|---|---|---:|---:|---|
| `[ID-001]` | `[TÍTULO]` | `[AUTORES]` | `[AÑO]` | `[BASE]` | `[DOI/URL]` | `[TIPO]` | `[N]` | `[0-100]` | incluir / respaldo / excluir |

## Criterio de relevancia: 80/100

| Criterio | Puntaje máximo |
|---|---:|
| Coincidencia directa con `[TEMA]` | 30 |
| Relación con el objetivo de la Unidad 1 | 20 |
| Calidad de la revista o conferencia y revisión por pares | 15 |
| Claridad metodológica y reproducibilidad | 15 |
| Actualidad o carácter fundacional | 10 |
| Resultados, datos o ejemplos aplicables | 10 |
| **Total** | **100** |

### Decisión

- `80-100`: incluir en la síntesis principal.
- `60-79`: conservar como respaldo secundario y revisar manualmente.
- `0-59`: excluir de la síntesis principal.

El número de citas nunca debe sustituir la pertinencia temática, la calidad metodológica ni la verificabilidad de la fuente.

## Ficha detallada del documento

```text
ID:
Tema: [TEMA]
Código temático: [CÓDIGO DEL TEMA]
Título:
Autores:
Año:
Base de datos:
DOI o URL:
Tipo de documento:
Objetivo del estudio:
Conjunto de datos o contexto:
Método o algoritmo:
Métricas utilizadas:
Resultados principales:
Limitaciones:
Posible ejemplo en R:
Coincidencia temática (0-30):
Relación con la unidad (0-20):
Calidad de la fuente (0-15):
Reproducibilidad (0-15):
Actualidad o carácter fundacional (0-10):
Aplicabilidad (0-10):
Puntaje total:
Decisión:
Justificación:
```

## Producto esperado

Al finalizar la búsqueda deben existir:

- Una lista de documentos incluidos con puntaje igual o superior a 80/100.
- Una lista separada de documentos de respaldo.
- Una síntesis conceptual de `[TEMA]`.
- Una lista de aplicaciones y oportunidades.
- Al menos un ejemplo reproducible en R.
- Referencias en formato BibTeX para el documento LaTeX.

## Referencia BibTeX

```bibtex
@article{autor_ano,
  author  = {[AUTORES]},
  title   = {[TÍTULO]},
  journal = {[REVISTA]},
  year    = {[AÑO]},
  doi     = {[DOI]}
}
```
