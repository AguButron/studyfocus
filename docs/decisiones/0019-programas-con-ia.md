# 0019: Leer los programas de los cursos con IA

**Estado:** aceptada.

**Fecha:** 2026-11-08

## Contexto

Al empezar un semestre, crear cada ramo, sus evaluaciones, sus fechas, sus porcentajes y sus requisitos toma mucho tiempo, aunque todo eso ya está escrito en el programa de cada curso.

## Decisión

- **Dentro de una carpeta** (de cualquier tipo) se pueden subir varios programas en PDF a la vez. "Subir programas" abre una ventana donde se arrastran o se eligen los archivos; se pueden seguir agregando mientras se revisan los primeros.
- **Una IA lee cada programa en el servidor** y saca:
  - el nombre, la sigla, el profesor, el horario y la sala;
  - la escala de notas;
  - cada evaluación con su tipo, fecha, hora y porcentaje;
  - los requisitos para aprobar.
- **Se revisa antes de guardar, cada uno en su pestaña:**
  - La pestaña "Subir" tiene la zona para arrastrar y la cola numerada (en cola, leyendo, para revisar, creado, descartado). Los programas se leen de a uno.
  - Cuando uno termina de leerse, se abre en su propia pestaña, que tiene solo su configuración editable. Si ya se está revisando otro, la nueva pestaña queda marcada con un punto y no interrumpe.
  - En cada pestaña se elige "Añadir ramo" (o "Completar ramo") o "Descartar". La pestaña se cierra y se pasa a la siguiente que espera revisión, o vuelve a "Subir".
  - Nada se guarda sin revisarlo. La IA puede equivocarse.
- **Solo lo que aporta a la nota final:** bonus, décimas extra, atrasos, asistencia, recuperativas y evaluaciones de última instancia no entran en la planilla. Si una evaluación tiene partes con nota propia (entrega y control), cada parte es una evaluación.
- **La IA describe la estructura y el servidor calcula:** la IA entrega los grupos de la nota (por ejemplo NTF, NTSO y NTR) con su peso dentro del grupo que los contiene, y cada evaluación con su peso dentro de su grupo. El servidor multiplica por la cadena de grupos para obtener el porcentaje de cada una sobre la nota final, y ajusta el redondeo para que sume exacto. Si aun así no suma 100 %, se le pregunta una vez más a la IA diciéndole cuánto sumó, y se queda la respuesta que esté más cerca de 100 %.
- **Requisitos sobre grupos:** un requisito como "NTSO ≥ 3,5" apunta a todas las evaluaciones dentro de ese grupo, a cualquier nivel. Los que no son de nota, como la asistencia, se descartan.
- **Exigencia:** si el programa no la dice, se asume 50 %.
- **El año:** a la IA se le da la fecha de hoy y el nombre del archivo, para deducir el año cuando el programa solo dice "10 de octubre".
- **Límite por minuto de Gemini:** si el modelo principal lo pasa, se espera lo que pide Google (hasta 40 segundos) y se reintenta antes de usar uno más liviano.
- **Cada evaluación por separado:** si el programa dice "5 talleres" o "3 pruebas", se crean "Taller 1" … "Taller 5", cada una con su parte del porcentaje, para anotar cada nota cuando llegue. Se le pide así a la IA, y si igual devuelve un grupo como "Talleres (5)", el servidor lo separa y reparte el porcentaje de modo que sume exacto. Solo queda junto un grupo de más de 20, o uno que no dice cuántas son.
- **Fechas:** solo se usa una fecha exacta. Si el programa dice "Semana 6", "por definir" o nada, la evaluación queda **sin fecha**. Se ve en su ramo como "Sin fecha" y no aparece en el calendario hasta que se le pone una. Por eso la agenda ahora acepta cosas sin fecha.
- **Requisitos:** se muestran y se editan solo como reglas que se revisan solas con las notas:
  - el promedio de un grupo de evaluaciones (o el final) debe llegar a una nota;
  - cada evaluación de un grupo debe llegar a una nota, por ejemplo el examen;
  - con un promedio de un grupo se exime, por ejemplo del examen.

  **La eximición** (agregada el 2026-11-09) dice también **de qué** se exime. Si el programa permite eximirse, la IA siempre agrega ese requisito, marcando de qué evaluaciones. Mientras eximirse sea posible, el promedio, el porcentaje evaluado y la nota que falta se calculan **sin esas evaluaciones**, como si la persona se fuera a eximir. Lo demás se reparte la nota completa, así que es la nota de presentación. Una nota en el ramo avisa que el cálculo supone la eximición y cuánto pesa el examen si no se exime. El examen vuelve a contar si ya tiene nota (se rindió), o si ya están todas las notas para eximirse y no alcanzó. En la ventana del ramo se marca de qué te eximes en "Te eximes de"; los requisitos de eximición guardados antes no lo tienen, así que no cambian el cálculo hasta marcarlo.

  El ramo muestra cuáles se cumplen y sobre qué evaluaciones. Junto al promedio hay un ícono que explica cómo se calcula. La IA también resume los requisitos en palabras; ese texto se guarda en el ramo, pero ya no se muestra ni se edita, porque un cuadro de texto largo confundía más de lo que ayudaba.
- **El horario** se guarda y se muestra en el ramo, pero no va al calendario. El horario de la semana se arma a mano ([0021](0021-horario-semanal.md)); la IA no lo llena.
- **Secciones:** si el curso tiene varias secciones con distinto profesor, horario o sala, la IA lee los datos de cada una. En la revisión aparece "Tu sección": al elegirla se completan el profesor, el horario y la sala de esa sección, en vez de guardar los de todas.
- **Un ramo que ya existe** en la carpeta, con la misma sigla o el mismo nombre, se completa: se le agrega lo que falta, sin duplicarlo ni cambiar su escala.
- **Los PDF no se guardan:** se leen y se descartan.
- **Se usa Gemini (Google) en su plan gratis.**
  - Se configura con `GEMINI_API_KEY`. El modelo es `gemini-3.5-flash`, y si está saturado o tarda más de un minuto, se prueba uno más liviano.
  - La IA está en una sola función del servidor (`askAi` en `server/src/syllabus.ts`), así que cambiar a una de pago es cambiar esa función.
- **Límite:** cada persona puede leer 10 programas cada 24 horas, para no agotar la cuota gratis entre todos. Solo cuentan las lecturas que llegan a la IA. `SYLLABUS_DAILY_LIMIT` cambia ese número, y con 0 no hay límite, solo para probar en desarrollo.

## Alternativas descartadas

- **Calcular la fecha desde "Semana 6"** con la fecha de inicio del semestre: se prefirió dejarla sin fecha y que la persona la complete.
- **Crear todo sin revisar:** la IA a veces se equivoca, y corregir después en cada ramo cuesta más.
- **Guardar los PDF en cada ramo:** necesitaría un almacenamiento de archivos. Puede venir después.
- **Las clases en el calendario:** lo llenarían de eventos que se repiten cada semana.
- **Una IA de pago desde el inicio:** se parte gratis para probar la idea.

## Consecuencias

- **Cambios en la base de datos:**
  - `sections` suma `schedule`, `requirements` y `rules` (JSON).
  - `agenda_items.due_date` puede quedar vacío.
  - Una tabla nueva, `syllabus_reads`, cuenta las lecturas de cada persona.
- **Lo que se envía a la IA:** en el plan gratis, Google puede usarlo para mejorar sus productos. Un programa de curso no es información sensible, pero la página avisa que lo lee una IA.
- **La cuota gratis es limitada y Google la cambia.** Si se acaba, la página dice que se pruebe más tarde.
- **Edición de los requisitos:** el texto y las reglas se editan en la ventana del ramo ("Editar"): cambiar el tipo, la nota y las evaluaciones, quitarlas o agregar nuevas. En el detalle del ramo solo se ve cómo va cada una.
