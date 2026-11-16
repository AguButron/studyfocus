# 0034: Cada sección con su dirección

**Estado:** aceptada.

**Fecha:** 2026-11-16

## Contexto

La página es una sola (`index.html`) que muestra y esconde secciones. Hasta ahora la dirección no cambiaba: siempre era `/`, estuvieras en Inicio o en Estadísticas. El botón atrás funcionaba (cada cambio se anotaba en el historial del navegador) y al recargar se volvía a la última sección (`sessionStorage`), pero no se podía compartir ni guardar un link a una sección, y abrir otra pestaña siempre partía en Inicio.

## Decisión

Cada sección tiene su ruta de verdad:

| Sección | Dirección |
|---|---|
| Inicio | `/` |
| Calendario | `/calendario` |
| Carpetas | `/carpetas` |
| Estudiar | `/estudiar` |
| Amigos | `/amigos` |
| Estadísticas | `/estadisticas` |
| Tienda | `/tienda` |
| Tu perfil | `/perfil` |
| Objetivos anteriores | `/objetivos` |
| El perfil de otra persona | `/perfil/usuario` |

- **En la página** (`menu.ts`): `PANEL_PATHS` dice la dirección de cada sección. `showPanel` la pone al cambiar de sección (con `pushState`, así atrás y adelante siguen funcionando) y, al abrir la página, la sección sale de la dirección (`panelFromPath`). Una dirección que no existe lleva a Inicio. Ya no se usa `sessionStorage` para recordar la sección.
- **En el servidor** (`createPageHandler` en `server/src/index.ts`): si lo pedido no es un archivo que exista, entrega `index.html`, y la página decide qué mostrar. Lo que tiene extensión de archivo (`.js`, `.css`, imágenes, fuentes…) y no existe sigue siendo un 404, para no entregar HTML en lugar de un archivo. En `/perfil/` no se mira la extensión, porque un usuario puede llamarse `ana.js`. Mientras se desarrolla, Vite hace lo mismo solo.
- **Las salas siguen con `?sala=CÓDIGO`**: entrar a una sala no es una sección del menú, y esos links ya se compartieron. El parámetro se agrega a la dirección de la sección en que estabas.
- **Los links de perfil de antes** (`/?perfil=usuario`) siguen funcionando y se cambian solos a `/perfil/usuario`.
- **Las direcciones de los archivos de la página son absolutas** (`/assets/…`, como las arma Vite), así que cargan bien desde una dirección anidada como `/perfil/ana`.

Probado con la versión compilada en otro puerto, sin base de datos: `/objetivos`, `/estadisticas`, `/perfil/prueba.benja` y `/no-existe` entregan la página; `/assets/no-existe.js` da 404 y `/favicon.svg` se entrega igual que antes.

## Alternativas descartadas

- **Un parámetro (`/?seccion=objetivos`)**, como `?sala=`: no necesitaba cambiar el servidor, pero las direcciones se ven peor. Se eligieron rutas de verdad.
- **Una librería de rutas:** con ocho secciones que se muestran y esconden, sobra.

## Consecuencias

- Se pueden compartir y guardar links a cada sección, y abrir una sección en otra pestaña. Va a servir para la [app nativa](0032-app-nativa.md): los avisos que abren una parte de la app necesitan una dirección para cada una.
- Una sección nueva necesita su dirección en `PANEL_PATHS`; si no, TypeScript avisa.
