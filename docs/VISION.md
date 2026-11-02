# Visión de StudyFocus

Este documento reúne hacia dónde va el proyecto. La [hoja de ruta](ROADMAP.md) dice qué se está haciendo ahora; aquí está el plan completo, incluidas las ideas que todavía no están decididas.

## La idea central

Estudiar solo cuesta. Ver que tus amigos también están trabajando motiva y mantiene la concentración de todo el grupo. StudyFocus crea esa sensación de estudiar en la misma mesa, aunque cada persona esté en su casa.

Las recompensas y la personalización existen para que den ganas de volver a estudiar. Durante una sesión, lo principal sigue siendo la concentración.

## Lo siguiente

Estas tareas cierran la fase 4, en este orden sugerido.

### 1. Bloquear la tecla E durante el estudio

Al comenzar el estudio, no te puedes levantar de la silla.

En la pausa y en el descanso sí te puedes levantar.

**Terminada cuando:** con el temporizador corriendo en un periodo de estudio, ni la tecla E ni el botón **Levantarte** te sacan de la silla, y queda claro por qué.

### 2. Varias cámaras

Mientras estudias se puede rotar entre las vistas, con una tecla o con botones.

| Cámara | Qué muestra |
|---|---|
| **Escritorio** | Primera persona mirando hacia abajo: tus manos y lo que estás haciendo (la actual) |
| **Mesa** | Primera persona con la vista al frente: quienes están en tu mesa |
| **Sala** | Toda la sala, con toda la gente que se ha unido |

**Terminada cuando:** se puede cambiar entre las tres sin levantarse, y el temporizador sigue visible en todas. En la cámara **Sala** el panel debe hacerse más pequeño, para no tapar lo que se quiere ver.

### 3. Compartir periodo y actividad

Cada persona avisa a toda la sala si está en estudio o en descanso, y qué está haciendo. Reemplaza la tarea "Mostrar a los demás en qué periodo está cada persona".

**Terminada cuando:** al cambiar de periodo o de actividad, todos en la sala se enteran, y quien entra después también lo ve.

### 4. Hacer clic en otra persona

Al hacer clic en el personaje de otra persona, se ve su apodo, su periodo y su actividad.

**Terminada cuando:** el clic funciona en la cámara **Mesa** y en la cámara **Sala**. En Three.js, para saber qué objeto está bajo el cursor se usa un *raycaster*.

### 5. Seguir donde mismo al recargar

Al recargar la página vuelves a la misma sala, a la misma silla y con el mismo temporizador, sin pasar por la pantalla inicial.

Hoy, al recargar, el servidor te ve desconectarte: libera tu silla y, si estabas solo, borra la sala. Por eso el servidor debe esperar unos segundos antes de hacerlo, y reconocerte al volver. Antes de tener cuentas, esto se puede resolver con un identificador guardado en el navegador.

**Terminada cuando:** al recargar en medio de un estudio sigues sentado en tu silla y con tu tiempo, aunque estés solo en la sala, y nadie te ve desaparecer. Si no vuelves, la silla se libera.

### 6. Cierre de la fase 4

Siguen pendientes el aviso con sonido y la reducción del redibujado. Esta última importa más ahora, porque habrá más cámaras y más personas en pantalla.

## Ideas para el futuro

### Sesión de estudio

- Escribir qué estás haciendo, por ejemplo "Repaso de cálculo", y que aparezca como una descripción al hacer clic en ti.
- Animaciones distintas según el periodo y la actividad, visibles para los demás.

### Avatar

- Crear un avatar a gusto propio, en vez de un cubo, en estilo pixel 3D (vóxeles).
- Construir cada personaje por piezas sobre una misma cuadrícula: cuerpo, pelo, ropa y accesorios. Así se pueden combinar y mover por separado.
- Una prueba con un personaje detallado (unos 7.400 triángulos) se mantuvo fluida con 12 personajes en una tarjeta gráfica potente. Falta medirla en un portátil común, y reducir la resolución automáticamente pierde los rasgos de la cara: cada resolución necesita su propio dibujo.

### Moneda y tienda

- Ganar una moneda por el tiempo de estudio.
- Comprar con ella ropa, gorros, emotes y mascotas.

### Espacios propios

- Armar salas de estudio a tu gusto.
- Tener una casa o pieza propia, para estudiar a solas.

### Ya estaban en el plan

- Una cuenta personal por usuario, donde se guarde todo el progreso y quede registro de todo.
- Salas que no se borren.
- Estadísticas de estudio.
- Chat de voz.

## Recomendaciones

Estas ideas no las pediste: son propuestas para que las evalúes.

### Sobre el orden

1. **Publicar antes de construir la tienda.** Propongo terminar la fase 4 y publicar (fase 5) antes de avatares y monedas. Probarlo con amigos de verdad dirá qué vale la pena construir, y ese trabajo es mucho mayor que todo lo hecho hasta ahora.
2. **Hacer las cuentas antes que la moneda.** Una moneda necesita una cuenta y una base de datos donde guardarse. Hoy nada sobrevive a un reinicio del servidor.

### Sobre la moneda

3. **Que el servidor cuente el tiempo.** Hoy el temporizador corre en el navegador, y cualquiera podría decir que estudió 10 horas. Si el tiempo da monedas, el servidor debe llevar la cuenta, como ya hace con las sillas. Es el cambio de arquitectura más importante de esta lista.
4. **Evitar que dé monedas dejar la pestaña abierta.** Se podría pedir una confirmación ocasional, poner un límite diario, o premiar solo los periodos completos.
5. **Premiar el tiempo, no competir.** Un ranking público puede desmotivar a quien estudia menos, o empujar a dejar la pestaña abierta. Las metas de grupo cuidan mejor la idea central.
6. **No vender moneda con dinero real, al menos al principio.** Trae obligaciones legales y de pagos, y cambia el sentido de la recompensa.

### Funciones que encajan con la idea

7. **Meta de grupo:** por ejemplo, "esta semana, la mesa acumula 20 horas". Refuerza justo la motivación que buscas.
8. **Resumen al terminar:** cuánto estudiaste hoy, y con quién.
9. **Reacciones silenciosas:** mandar un aplauso a quien terminó un periodo, sin interrumpir.
10. **Chat solo en los descansos:** se puede conversar sin romper la concentración de nadie.
11. **Sonido ambiente:** lluvia, cafetería o biblioteca, que cada quien elige para sí.
12. **Un modo sin distracciones:** ocultar todo salvo el temporizador.

### Si se abre a más gente

13. **Moderación:** apodos, descripciones y salas requieren una forma de reportar y de expulsar a alguien de una sala. Con desconocidos, también pasa a importar la privacidad de lo que escribe cada persona.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Tecla E en la pausa | No se bloquea: solo durante un periodo de estudio en curso. |
| Quién ve tu actividad | Todas las personas de la misma sala. |
| Recargar la página | Sigues donde mismo: misma silla y mismo temporizador. |
| Progreso a largo plazo | Cada persona tendrá una cuenta, donde se guarda todo y queda registro. |
| Cámaras | Se conservan **Escritorio**, **Mesa** y **Sala**, y se puede rotar entre ellas. |
| Estilo del avatar | Pixel 3D (vóxeles), con el nivel de detalle de la [prueba](../prototipos/avatar-voxel/README.md). |
