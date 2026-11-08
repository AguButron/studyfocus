# 0018: Espacios y apartados en vez de solo ramos

**Estado:** aceptada. Reemplaza los ramos de la [decisión 0016](0016-plataforma-de-estudio.md).

**Fecha:** 2026-11-08

**Nombre:** en la página se llaman **carpetas**. Se eligió así porque todos lo entienden al tiro: un semestre es una carpeta con sus ramos adentro. En el código y en las rutas del servidor siguen llamándose espacios (`spaces`, `/api/espacios`).

## Contexto

Los ramos se pensaban por semestre, pero el semestre se llama distinto en cada país (2026-1 en Chile, Spring 2026 en otros), y también se quiere organizar proyectos personales o cursos.

## Decisión

- **Un espacio** agrupa lo que se estudia o se hace. Tiene un nombre libre y un tipo: semestre, proyecto, curso u otro.
- **Un apartado** es una parte de un espacio. Según el tipo del espacio se llama ramo (semestre), parte (proyecto), módulo (curso) o sección (otro).
- Cada apartado tiene nombre y color, que son obligatorios. Además puede tener sigla, profesor, sala y una meta semanal de horas.
- Cada apartado tiene su escala de notas: la mínima, la máxima, la de aprobación y el porcentaje de exigencia. Se propone la chilena (1,0 a 7,0, se aprueba con 4,0, con 60 % de exigencia), y cada uno la cambia si estudia en otro sistema.
- **La agenda se vincula a un apartado** cuando se agrega desde ese apartado (o desde un programa). La ventana de la evaluación no deja elegirlo ni cambiarlo: solo muestra de qué ramo es. Lo que se agrega desde el calendario o Inicio queda sin apartado. Lo vinculado se ve del color del apartado en el calendario y en Inicio, con su sigla o su nombre.
- **Las notas:** una cosa de la agenda con apartado puede llevar el porcentaje que vale y su nota. La nota se escribe, o se calcula desde el puntaje con la exigencia del apartado. El apartado muestra el promedio ponderado de lo evaluado, cuánto falta por evaluar y qué nota hace falta en lo que queda para aprobar.
- **El tiempo de estudio por apartado:** el temporizador pregunta qué se está estudiando. No se puede cambiar mientras corre el estudio, así cada periodo se anota completo con un solo apartado. Estadísticas muestra las horas de cada apartado en los últimos 7 días, y cada apartado muestra su avance hacia la meta semanal.
- **Cómo se recorre:** la sección Carpetas muestra solo las carpetas, con su nombre, su tipo y la lista de sus ramos, cada uno con un punto de su color. Al abrir una se ven sus ramos, y ahí se agregan y se edita la carpeta. Al abrir un ramo se ve su detalle, y de ahí se vuelve a su carpeta.
- **En Inicio** aparece la carpeta más reciente (la última que se abrió) con un punteo de lo que tiene; cada punto abre su detalle.
- **Orden dentro de un ramo:** sus evaluaciones y tareas se ordenan arrastrándolas desde su manilla, o con las flechas del teclado. El orden se guarda (`agenda_items.position`); lo creado desde un programa sigue el orden del programa, y lo nuevo queda al final. Sin orden propio, van por fecha.
- Un espacio terminado se archiva: deja de aparecer al elegir apartado, pero sus horas y sus notas quedan.
- Borrar un espacio borra sus apartados. La agenda y el tiempo de estudio quedan, sin apartado.

## Alternativas descartadas

- **Un solo nombre para todo ("apartados"):** se prefirió que se llame como en cada caso: ramos en un semestre, partes en un proyecto.
- **El color del tipo en el calendario:** con apartados, el color del ramo dice más de un vistazo; el tipo (prueba, tarea) se lee en el texto.

## Consecuencias

- Hay dos tablas nuevas, `spaces` y `sections`. `agenda_items` suma el apartado, el porcentaje y la nota, y `study_segments` suma el apartado.
- El servidor revisa que el apartado sea de la misma cuenta, y que la nota esté dentro de su escala.
- Los porcentajes de un apartado deberían sumar 100. La página no lo exige: si suman menos, lo que falta se cuenta como "por evaluar".
