# 0028: Objetivos de estudio en vez de una meta diaria

**Estado:** aceptada. Reemplaza la idea de una meta diaria en Inicio.

**Fecha:** 2026-11-10

## Contexto

Se pensó en una meta diaria fija, como "2 horas al día". Pero lo que se quiere estudiar cambia con cada prueba o entrega, y la cantidad de horas importa más que el día. Sirve más decir "quiero estudiar 8 horas de Cálculo antes del viernes".

## Decisión

- **Un objetivo** dice cuántas horas, hasta qué día y de qué: un ramo, o en general (cualquier ramo). Se pueden tener varios a la vez, hasta 20 activos.
- **Qué cuenta:**
  - Lo estudiado desde que se crea el objetivo hasta el final del día límite, en la zona horaria de la persona.
  - Si es de un ramo, solo lo que se estudió con ese ramo elegido en el temporizador.
  - Una misma hora cuenta en todos los objetivos que le correspondan.
- **Dónde se crea:**
  - **En Inicio**, en "Tus objetivos", bajo ¿Estudiamos?.
  - **Mientras se estudia**, en el panel del temporizador. Ahí el ramo que se está estudiando viene ya elegido.
  - Con un clic en un objetivo se edita o se borra.
- **Una barra por objetivo,** del color de su ramo (o amarilla si es general), con:
  - lo estudiado, el total y lo que falta;
  - para cuándo es;
  - en Inicio, cuánto sería por día hasta la fecha.
- **Avanza en vivo:** el servidor guarda el estudio recién cuando termina el periodo, así que mientras corre un periodo la barra suma lo que va de él. Al cambiar de periodo se vuelven a pedir los objetivos.
- **Al cumplirse** aparece una sola vez el aviso "¡Cumpliste tu objetivo!", aunque sea a mitad de un periodo.
- **Después del día límite** se sigue viendo 12 horas en Inicio como "Cumplido" o "No alcanzado", y después pasa sola a los objetivos anteriores. En el temporizador solo se ven los que siguen corriendo.
- **La X y los objetivos anteriores (2026-11-16):** los objetivos terminados, y los cumplidos antes de su fecha, tienen una X en Inicio que los pasa a los anteriores, con un aviso para deshacerlo. "Ver objetivos anteriores", bajo la lista de Inicio, abre su propia página: arriba cuántos objetivos te has propuesto y cuántos cumpliste (contando los activos), y abajo cada uno con cómo resultó, por ejemplo "No alcanzado: 6 h de 8 h (75 %)". No se borran: se marcan con `archived_at` en `study_goals`, y los archivados no cuentan para el límite de 20 a la vez. La página los pide aparte (`GET /api/objetivos/historial`), así Inicio y el temporizador no cargan todos los anteriores. Parten ordenados por fecha de término (el más reciente primero) y se pueden filtrar por resultado (cumplidos o no alcanzados), por ramo y por cuándo terminaron (últimos 30 días, 3 meses o el último año), y ordenar por más antiguos, más horas o mayor avance. Los filtros se aplican en la página, sin volver a pedir los datos.
- **Con el temporizador plegado** se ven en miniatura bajo el tiempo. Cada uno se puede ocultar ahí con el ojo (solo en ese navegador, `studyfocus.goalsHidden`) y volver a mostrar con el panel desplegado.

## Alternativas descartadas

- **Una meta por día (o por día de la semana):** no se ajusta a semanas con pruebas, y no dice para qué se estudia.
- **Contar desde una fecha anterior a la creación:** se prefirió que cuente desde que se crea, que es lo que se espera al decir "quiero estudiar 8 horas de aquí al viernes".

## Consecuencias

- Una tabla nueva, `study_goals`: minutos, día límite, ramo opcional y desde cuándo cuenta. Si se borra el ramo, se borran sus objetivos.
- Rutas: `GET /api/objetivos?tz=…`, y `POST /api/objetivos`, `/editar` y `/borrar`.
- El temporizador acepta varios avisos de cambio de periodo, para el sonido y para los objetivos.
- El aviso de abajo (el de deshacer) también muestra avisos sin botón.
