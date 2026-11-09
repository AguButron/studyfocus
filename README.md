# StudyFocus

Un espacio virtual para estudiar de forma ordenada con tus amigos, sin necesidad de estar juntos físicamente. Entras a una sala 3D, llevas a tu personaje hasta una mesa, te sientas y estudian juntos.

No es un juego para pasarlo bien: el personaje y la sala existen para dar la sensación de compartir una mesa de estudio.

## Principio de diseño

Cada función debe ayudar a estudiar o a sentirse acompañado al hacerlo. Si distrae durante una sesión de estudio, no entra. Las recompensas futuras premian el tiempo de estudio y sirven para motivar a volver, no para competir.

La visión completa y las ideas a futuro están en [docs/VISION.md](docs/VISION.md).

## Estado

MVP completo, en desarrollo la fase 6. El avance está en [docs/ROADMAP.md](docs/ROADMAP.md).

Publicada en <https://studyfocus-yukw.onrender.com/>. Con el plan gratis se duerme sin uso, así que la primera visita puede tardar cerca de un minuto.

## Objetivo del MVP

Creo una sala, le paso un link a un amigo, ambos caminamos con nuestro personaje, nos sentamos en la misma mesa y cada uno estudia a su ritmo con su propio temporizador.

## Tecnologías previstas

- **Cliente:** TypeScript, Three.js y Vite
- **Servidor:** TypeScript, Node.js y Socket.IO

Las decisiones importantes y sus motivos están en [docs/decisiones](docs/decisiones).

## Requisitos para desarrollar

- Git
- Node.js 24 o superior

## Ejecutar el cliente

```bash
cd client
npm install
npm run dev
```

Luego abre la dirección que aparece en la terminal, normalmente `http://localhost:5173`.

## Ejecutar el servidor

En otra terminal, porque cliente y servidor corren a la vez:

```bash
cd server
npm install
npm run dev
```

El servidor escucha en el puerto 3000.

### Cuentas

Para entrar a una sala hay que iniciar sesión, así que el servidor necesita una base de datos. Copia `server/.env.example` como `server/.env` y completa:

- `DATABASE_URL`: la dirección de una base de datos PostgreSQL. Las tablas se crean solas.
- `GOOGLE_CLIENT_ID`: el ID de cliente de Google. Sin él, solo funcionan las cuentas locales.

En el hosting, estas mismas variables se definen en su panel. En producción no se lee el archivo `.env`.

### Cuentas y personas de prueba

Con `npm run dev`, el servidor prepara cuentas de prueba sin contraseña: Ana, Benja y Cata. Para entrar, toca su botón en la ventana de iniciar sesión, en el apartado "Cuentas de prueba". Para probar con dos personas a la vez, abre la otra en una ventana de incógnito.

También deja conectadas a otras cuatro personas de prueba, que son amigas de esas cuentas: Diego, Ema y Fran estudian sentados en una sala, y Gabi estudia sola. Cambian solas entre estudio y descanso, y tienen horas de estudio de los últimos días. El código de su sala aparece en la terminal del servidor, en la línea "Personas de prueba estudiando en la sala".

Nada de esto existe con `npm start`. Los motivos están en [la decisión 0020](docs/decisiones/0020-cuentas-de-prueba.md).

## Ejecutar como en producción

Un solo servidor entrega la página y atiende las conexiones, en el puerto de la variable `PORT` (3000 si no está definida):

```bash
npm run build
npm start
```

Luego abre `http://localhost:3000`. Para volver a desarrollar después de esto, ejecuta de nuevo `npm install` en `server`, porque el comando anterior deja solo lo necesario para producción.
