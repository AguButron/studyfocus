# 0020: Cuentas y personas de prueba al desarrollar

**Estado:** aceptada

**Fecha:** 2026-11-08

## Contexto

Para probar las salas, los amigos y la presencia hacía falta crear varias cuentas a mano y abrir varias ventanas. Además, una sala sin nadie más no muestra cómo se ve estudiar acompañado.

## Decisión

- **Solo con `npm run dev`:** el script pasa `--cuentas-de-prueba` al servidor. Con `npm start`, que es lo que corre en el hosting, nada de esto existe: la página no recibe la lista y la ruta para entrar responde 404.
- **Cuentas sin contraseña:** Ana, Benja y Cata aparecen en un apartado de la ventana de iniciar sesión. Se entra con un botón, por la ruta `POST /api/account/prueba`.
- **Personas conectadas:** Diego, Ema y Fran están sentados en una sala de estudio, y Gabi estudia sola. Viven solo en la memoria del servidor, sin conexión propia. Cambian entre 25 minutos de estudio y 5 de descanso, desfasadas entre sí. La primera vez se les anotan horas de estudio de los últimos 7 días, para tener con quién comparar.
- **Todas son amigas entre sí**, así que desde cualquiera de las tres cuentas se ve a las demás en línea.
- **Cómo se reconocen:** por un `google_sub` que empieza con `prueba:`. Google solo pone números en ese campo, así que nunca chocan con una cuenta real. Sus nombres de usuario empiezan con `prueba.`, un prefijo que nadie más puede elegir.

## Alternativas descartadas

- **Cuentas con una contraseña conocida:** la base de datos de desarrollo puede ser la misma que la del sitio publicado. Allí cualquiera podría entrar con esas cuentas. Sin contraseña, en el sitio publicado no se puede entrar a ellas de ninguna forma.
- **Bots que se conectan por Socket.IO como una página:** se parecerían más a una persona de verdad, pero necesitan su propia sesión y más código. Para ver gente en la sala basta con que estén en la memoria.

## Consecuencias

- Las sillas de las personas de prueba copian la ubicación de las mesas de `client/src/room.ts`. Si la sala cambia, hay que cambiar también `server/src/testPeople.ts`.
- Cada vez que el servidor se reinicia, las personas de prueba se cambian a una sala con otro código. La sala anterior se borra sola a los 10 minutos.
- Las cuentas de prueba quedan guardadas en la base de datos, pero sin el modo de prueba no se puede entrar a ellas.
