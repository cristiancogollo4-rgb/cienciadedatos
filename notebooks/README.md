# Notebooks del proyecto

Estos notebooks documentan el proceso de ciencia de datos usado para construir el clasificador de semillas.

En la version limpia del proyecto no se incluyen datasets, videos ni salidas pesadas. Los notebooks quedan como evidencia reproducible del flujo:

1. `00_diagnostico_fuga_datos.ipynb`: criterios para evitar fuga de datos.
2. `01_extraer_frames_originales.ipynb`: extraccion de frames desde videos propios.
3. `02_preparar_dataset_limpio.ipynb`: limpieza, balanceo y split train/validation/test.
4. `03_entrenar_modelo_gpu.ipynb`: entrenamiento con transfer learning y fine tuning.
5. `04_evaluar_modelo.ipynb`: evaluacion con test set y matriz de confusion.
6. `05_predecir_imagen.ipynb`: prediccion individual desde imagen.
7. `06_validacion_externa.ipynb`: validacion con imagenes externas.

Para ejecutarlos de punta a punta se deben restaurar los datos de trabajo:

```text
videos originales
dataset_frames/
dataset_clean/
dataset_augmented/
validacion_internet/
```

El modelo productivo conservado en el proyecto es:

```text
models/modelo_semillas_best.keras
```
