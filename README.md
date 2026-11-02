# StudyFocus

Un espacio virtual para estudiar de forma ordenada con tus amigos, sin necesidad de estar juntos físicamente. Entras a una sala 3D, llevas a tu personaje hasta una mesa, te sientas y estudian juntos.

No es un juego para pasarlo bien: el personaje y la sala existen para dar la sensación de compartir una mesa de estudio.

## Principio de diseño

Cada función debe ayudar a estudiar o a sentirse acompañado al hacerlo. Si distrae durante una sesión de estudio, no entra. Las recompensas futuras premian el tiempo de estudio y sirven para motivar a volver, no para competir.

La visión completa y las ideas a futuro están en [docs/VISION.md](docs/VISION.md).

## Estado

En desarrollo, fase 4. El avance está en [docs/ROADMAP.md](docs/ROADMAP.md).

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
