# Búsqueda bibliográfica estructurada: Unidad 1

## Objetivo

Identificar literatura científica pertinente y de calidad sobre los siete temas de la unidad 1:

1. Minería de datos.
2. Procesos de minería de datos (KDD).
3. Metodología CRISP-DM.
4. Modelos de minería de datos.
5. Modelos híbridos.
6. Predicción.
7. Almacenes de datos (Data Warehouse).

Las consultas están diseñadas para Google Scholar, Scopus, Web of Science, IEEE Xplore y ScienceDirect. Se recomienda ejecutar primero la consulta amplia y después aplicar los filtros indicados.

## Parámetros comunes

- Idiomas: español e inglés.
- Tipo de documento: artículo científico, revisión sistemática, capítulo académico o conferencia arbitrada.
- Periodo recomendado: 2015-2026. Conservar trabajos clásicos anteriores cuando sean fundacionales, por ejemplo, KDD, CRISP-DM o Data Warehouse.
- Orden de revisión: primero revisiones sistemáticas y artículos con muchas citas; después estudios aplicados y artículos metodológicos.
- Exclusiones generales: educación escolar, redes sociales sin relación metodológica, publicidad, opiniones no académicas y documentos sin texto completo o resumen verificable.
- En Google Scholar, revisar también las referencias y los artículos que citan los trabajos altamente pertinentes.

## 1. Minería de datos

### Google Scholar

```text
("minería de datos" OR "data mining") AND (aplicaciones OR application* OR empresarial* OR business OR industry) AND ("toma de decisiones" OR "decision making" OR oportunidad* OR benefit* OR prediction OR predicción)
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY (("data mining" OR "minería de datos") AND (application* OR empresarial* OR business OR industry) AND ("decision making" OR "toma de decisiones" OR opportunity OR oportunidad* OR benefit* OR prediction OR predicción))
```

### Enfoque de revisión

```text
("data mining" OR "minería de datos") AND ("systematic review" OR "literature review" OR "revisión sistemática") AND (application* OR empresarial* OR business)
```

### Aplicaciones por sector

```text
("data mining" OR "minería de datos") AND (healthcare OR salud OR finance OR finanzas OR manufacturing OR manufactura OR education OR educación) AND (application* OR case study OR "estudio de caso")
```

### Calidad, ética y privacidad

```text
("data mining" OR "minería de datos") AND (privacy OR privacidad OR fairness OR equidad OR ethics OR ética OR explainab* OR explicab*) AND (method* OR framework OR evaluation)
```

## 2. Procesos de minería de datos (KDD)

### Google Scholar

```text
(("knowledge discovery in databases" OR KDD OR "descubrimiento de conocimiento en bases de datos") AND (process OR proceso* OR framework OR ciclo OR pipeline) AND ("data mining" OR "minería de datos"))
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY (("knowledge discovery in databases" OR KDD OR "knowledge discovery from databases") AND (process* OR framework* OR lifecycle OR ciclo* OR pipeline*) AND ("data mining" OR "minería de datos"))
```

### Enfoque metodológico

```text
("KDD process" OR "KDD methodology" OR "knowledge discovery process") AND (selection OR preprocessing OR transformation OR mining OR evaluation OR interpretation)
```

### Comparación KDD y otros procesos

```text
(KDD OR "knowledge discovery in databases") AND (CRISP-DM OR SEMMA OR methodology OR metodología) AND (comparison OR comparación OR framework*)
```

## 3. Metodología CRISP-DM

### Google Scholar

```text
("CRISP-DM" OR "Cross-Industry Standard Process for Data Mining") AND (methodology OR metodología OR framework OR proceso OR implementation OR implementación) AND (data mining OR "minería de datos")
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY (("CRISP-DM" OR "Cross-Industry Standard Process for Data Mining") AND (methodolog* OR framework* OR process* OR implementation OR implementación) AND ("data mining" OR "minería de datos"))
```

### Aplicación empresarial

```text
("CRISP-DM") AND (business understanding OR "comprensión del negocio" OR deployment OR despliegue OR industry OR empresarial*)
```

### Adaptaciones y limitaciones

```text
("CRISP-DM") AND (adapt* OR extension OR extensión OR limitation* OR limitaciones OR agile OR ágil OR deployment OR despliegue) AND (data science OR "ciencia de datos")
```

## 4. Modelos de minería de datos

La palabra `modelo` es demasiado amplia si se usa sola; por eso se combina con algoritmos, evaluación y tareas de minería de datos.

### Google Scholar

```text
("data mining model*" OR "modelos de minería de datos") AND (classification OR clasificación OR clustering OR agrupamiento OR regression OR regresión OR association rule* OR "reglas de asociación") AND (evaluation OR evaluación OR accuracy OR precisión OR performance OR rendimiento)
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY (("data mining model*" OR "modelos de minería de datos") AND (classification OR clustering OR regression OR "association rule*") AND (evaluation OR performance OR accuracy OR validation))
```

### Comparación de modelos

```text
("data mining") AND (model comparison OR "comparación de modelos" OR algorithm comparison OR "comparación de algoritmos") AND (classification OR regression OR clustering) AND (performance OR accuracy OR evaluation)
```

### Interpretabilidad y validación

```text
("data mining model*" OR "modelos de minería de datos") AND (interpretab* OR explicab* OR SHAP OR feature importance OR "importancia de variables") AND (validation OR validación OR robustness OR robustez)
```

## 5. Modelos híbridos

### Google Scholar

```text
(("hybrid model*" OR "hybrid data mining" OR "modelos híbridos") AND ("data mining" OR "minería de datos") AND (prediction OR predicción OR classification OR clasificación OR optimization OR optimización OR ensemble))
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY (("hybrid model*" OR "hybrid data mining" OR "modelos híbridos") AND ("data mining" OR "minería de datos") AND (predict* OR classification OR optimization OR ensemble OR "machine learning"))
```

### Hibridación de técnicas

```text
("hybrid data mining") AND (neural network* OR "red neuronal*" OR fuzzy OR difuso* OR genetic algorithm* OR "algoritmo genético*" OR clustering OR ensemble) AND (evaluation OR validation OR performance)
```

### Ensambles y combinación de predictores

```text
((ensemble OR ensamble OR stacking OR bagging OR boosting OR "model combination") AND ("data mining" OR "minería de datos") AND (generalization OR generalización OR robustness OR robustez))
```

## 6. Predicción

### Google Scholar

```text
((predict* OR predicción OR pronóstico OR forecasting) AND ("data mining" OR "minería de datos") AND (model* OR algorithm* OR modelo* OR algoritmo*) AND (evaluation OR validation OR accuracy OR precisión))
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY ((predict* OR forecasting OR predicción OR pronóstico) AND ("data mining" OR "minería de datos") AND (model* OR algorithm*) AND (evaluation OR validation OR accuracy OR performance))
```

### Predicción empresarial

```text
("data mining" OR "minería de datos") AND (predictive analytics OR "analítica predictiva" OR forecasting OR pronóstico) AND (business OR empresarial* OR demand OR demanda OR sales OR ventas) AND (model* OR algorithm*)
```

### Evaluación de pronósticos

```text
(forecast* OR pronóstico OR predict*) AND ("data mining" OR "minería de datos") AND (RMSE OR MAE OR MAPE OR "cross validation" OR "validación cruzada" OR uncertainty OR incertidumbre)
```

## 7. Almacén de datos (Data Warehouse)

### Google Scholar

```text
(("data warehouse" OR "almacén de datos" OR "almacenamiento de datos") AND (architecture OR arquitectura OR ETL OR "extract transform load" OR integración OR integration) AND ("data mining" OR analytics OR analítica OR business intelligence OR "inteligencia de negocios"))
```

### Scopus, Web of Science o bases con campos

```text
TITLE-ABS-KEY (("data warehouse" OR "almacén de datos") AND (architectur* OR ETL OR "extract transform load" OR integration OR integración) AND ("data mining" OR analytics OR "business intelligence"))
```

### Calidad y gestión del almacén

```text
("data warehouse") AND (data quality OR "calidad de datos" OR governance OR gobernanza OR security OR seguridad OR performance OR rendimiento) AND (business intelligence OR analytics OR "data mining")
```

### Modelado dimensional y arquitectura

```text
("data warehouse") AND (dimensional model* OR "modelo dimensional" OR star schema OR "esquema estrella" OR snowflake OR OLAP) AND (ETL OR ELT OR architecture OR arquitectura)
```

## Estrategia de refinamiento

Aplicar la búsqueda en tres rondas. En la primera se usa una consulta amplia para medir el volumen. En la segunda se agregan el sector, la técnica o la fase metodológica. En la tercera se restringe por título, resumen, año y tipo de documento.

Para reducir ruido, usar comillas en conceptos compuestos, `OR` para sinónimos, `AND` para combinar dimensiones y `-` en Google Scholar para excluir términos. Por ejemplo:

```text
"data mining" "CRISP-DM" -advertising -marketing
```

Registrar también la fecha exacta de consulta, porque los índices cambian y el número de citas se actualiza continuamente.

## Control de calidad de los resultados

Antes de asignar el puntaje, comprobar que el documento tenga autores identificables, afiliación institucional, revista o conferencia, año, DOI o URL estable, resumen suficiente y método descrito. Para revisiones sistemáticas, verificar la estrategia de búsqueda y los criterios de inclusión. Para estudios aplicados, verificar el conjunto de datos, las métricas y la comparación con una línea base.

No contar dos veces el mismo estudio publicado como preprint, conferencia y artículo. Mantener el registro de la versión consultada y conservar el DOI de la publicación final cuando exista.

## Procedimiento de búsqueda

1. Ejecutar cada consulta en Google Scholar.
2. Ejecutar la versión `TITLE-ABS-KEY` en Scopus o Web of Science cuando la institución tenga acceso.
3. Registrar en una hoja de cálculo: tema, consulta, base de datos, fecha, título, autores, año, DOI, enlace, tipo de documento, número de citas y resumen.
4. Eliminar duplicados usando DOI, título y primer autor.
5. Leer primero título y resumen. Descargar el texto completo solo cuando el documento pase el filtro inicial.
6. Asignar la puntuación de relevancia definida abajo.
7. Conservar los documentos con una puntuación igual o superior a 80/100 y documentar el motivo de exclusión de los demás.

## Criterio reproducible de relevancia: 80/100

| Criterio | Puntaje |
|---|---:|
| Coincidencia directa con el tema principal | 30 |
| Coincidencia con el objetivo de la unidad o aplicación empresarial | 20 |
| Calidad de la fuente y revisión por pares | 15 |
| Claridad metodológica y posibilidad de reproducir el estudio | 15 |
| Actualidad, o carácter fundacional claramente justificado | 10 |
| Resultados, ejemplos o datos aplicables | 10 |
| **Total** | **100** |

### Regla de selección

- `80-100`: documento pertinente; incluirlo en la categoría del tema.
- `60-79`: documento posiblemente útil; conservarlo como respaldo secundario y revisar manualmente.
- `0-59`: documento no prioritario; excluirlo de la síntesis principal.
- Un documento no debe superar el umbral solo por tener muchas citas. La pertinencia temática y la calidad metodológica son obligatorias.

## Ficha de evaluación

```text
ID:
Tema:
Título:
Autores:
Año:
Base de datos:
DOI o URL:
Tipo de documento:
Coincidencia temática (0-30):
Aplicación a la unidad (0-20):
Calidad de la fuente (0-15):
Claridad metodológica (0-15):
Actualidad o carácter fundacional (0-10):
Resultados aplicables (0-10):
Puntaje total:
Decisión: incluir / respaldo secundario / excluir
Justificación:
```

## Nota para la siguiente etapa

Los documentos incluidos deben etiquetarse con uno o más de estos códigos: `MD`, `KDD`, `CRISP-DM`, `MODELOS`, `HIBRIDOS`, `PREDICCION` y `DATA-WAREHOUSE`. Esa clasificación permitirá generar posteriormente un documento LaTeX por tema y seleccionar ejemplos implementables en R.
