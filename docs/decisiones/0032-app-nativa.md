# 0032: StudyFocus en el celular, como app nativa

**Estado:** en discusión. Está decidido que será una app nativa; falta elegir con qué hacerla.

**Fecha:** 2026-11-14

## Contexto

El roadmap decía "adaptar la página al celular", es decir, que la misma página se viera bien en el navegador del teléfono. Se descartó: una página en el navegador del celular no aporta lo suficiente. La versión del celular será una **app nativa**, instalada desde la Play Store o la App Store.

## Lo que la app puede hacer y la web no (o no bien)

- **Avisos del Pomodoro con el teléfono bloqueado o la app cerrada.** El navegador del celular los corta.
- **Modo concentración:** activar "No molestar" mientras estudias o, en Android, bloquear otras apps. Es lo más cercano a la idea central de StudyFocus.
- **Recordatorios de la agenda** ("mañana tienes prueba de Cálculo") sin abrir la app.
- **Un widget** en la pantalla de inicio con la racha o el tiempo de hoy.
- **Estar en las tiendas**, con su ícono.

## Las opciones

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| **Capacitor** (recomendada) | Envuelve la página actual en una app nativa, con plugins para lo nativo | Reutiliza todo: la sala 3D, el chat, el calendario, las carpetas y el servidor. Una sola base de código para la web, Android y iPhone | La interfaz sigue siendo HTML: hay que diseñar las pantallas para el tamaño del teléfono, y lo muy nativo se hace con plugins |
| **React Native** | Rehace la interfaz con componentes nativos, en TypeScript | Se siente más "app". El servidor y la lógica se mantienen | Reescribir casi todas las pantallas, y la sala 3D con otra librería. Dos interfaces que mantener (web y app) |
| **Flutter** | Reescritura completa en Dart | Muy buena interfaz en Android e iPhone | Otro lenguaje, y rehacer todo |
| **Nativo puro** (Kotlin y Swift) | Dos apps, una por sistema | Lo más nativo posible | Dos apps completas más la web. Demasiado para una persona |

## Lo que hace falta con cualquier opción

- **Diseñar las pantallas para el teléfono:** el menú, Inicio, el calendario, las carpetas, la sala 3D y el temporizador. Con Capacitor se hace en el CSS actual. Con las otras, se dibuja de nuevo.
- **Cuentas desde la app:** la sesión hoy vive en una cookie del navegador. En la app hay que revisar que funcione la cookie, o usar un token.
- **Cuentas de desarrollador:** Google Play cobra un pago único de 25 dólares; Apple, 99 dólares al año.
- **Probar en un teléfono o un emulador,** con Android Studio (y Xcode en un Mac para el iPhone).

## Próximo paso

Elegir la opción. Con Capacitor, el orden sería:

1. Crear el proyecto de Android.
2. Abrir la página dentro de la app y revisar la sesión.
3. Diseñar las pantallas para el teléfono.
4. Avisos del Pomodoro y de la agenda.
5. Modo concentración.
6. Publicar en Google Play.
