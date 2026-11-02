# 0007: Publicar la página y el servidor como un solo servicio

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

Mientras se desarrolla, Vite entrega la página en un puerto y el servidor atiende las conexiones en otro. Para publicar había que decidir si mantener esa separación.

## Decisión

En producción, el servidor de Node también entrega la página ya compilada, con la librería `sirv`. El cliente se conecta al mismo sitio del que vino. El servidor corre el TypeScript directamente, porque Node 24 ya sabe quitarle los tipos, así que no hay un paso de compilación del servidor.

## Alternativas descartadas

- **Dos servicios, con la página en un hosting estático:** la página cargaría al instante aunque el servidor esté dormido, pero hay que configurar direcciones y CORS, y mantener dos despliegues.
- **Escribir a mano la entrega de archivos:** es poco código, pero es fácil dejar un error que permita leer archivos fuera de la carpeta.

## Consecuencias

- Sirve cualquier hosting que ejecute Node 24 y acepte WebSocket, sin atarse a uno.
- Un solo comando de compilación y uno de arranque, definidos en el `package.json` de la raíz.
- Si el hosting duerme el servicio, la página tampoco carga hasta que despierte.
- Las salas siguen en la memoria: cada despliegue o reinicio las borra.
