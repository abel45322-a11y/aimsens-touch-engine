# AimSens Touch Engine 🎯📱

![License](https://img.shields.io/badge/License-MIT-brightgreen)
![PWA](https://img.shields.io/badge/PWA-Supported-00f0ff)
![Capacitor](https://img.shields.io/badge/Capacitor-Android-7000ff)
![Oppo A58](https://img.shields.io/badge/Optimized-Oppo%20A58%20(180Hz)-ff007f)

Motor de sensibilidad táctil de baja latencia con curvas de Bézier dinámicas, tope de velocidad máxima y filtro de suavizado anti-jitter, empaquetado como **PWA** y listo para generar una aplicación nativa de **Android (APK)** mediante **Capacitor**.

Diseñado para ayudar a personas con temblor de mira o necesidad de ajuste fino en pantallas táctiles (especialmente optimizado para las especificaciones del **Oppo A58**: 180Hz muestreo táctil, 60Hz refresco de pantalla y procesador MediaTek Helio G85).

---

## 📥 ¿Cómo Descargar la App (APK) desde GitHub?

¡Este repositorio incluye un flujo automatizado de **GitHub Actions** que construye el archivo APK instalable automáticamente!

### Paso a paso para subirlo a tu cuenta de GitHub y descargar el APK:

1. **Subir el código a GitHub**:
   - Crea un nuevo repositorio público o privado en tu cuenta de [GitHub](https://github.com/new) con el nombre `aimsens-touch-engine`.
   - Arrastra todos los archivos de este proyecto a la página del repositorio o usa **GitHub Desktop** para publicar el repositorio.

2. **Descargar el APK listo para instalar**:
   - Ve a la pestaña **Actions** en la parte superior de tu repositorio en GitHub.
   - Selecciona el flujo de trabajo llamado **Build & Release Android APK**.
   - Haz clic en la última ejecución completada (con el check verde `✓`).
   - En la sección **Artifacts** (al final de la página), haz clic en **`AimSens-TouchEngine-APK`**.
   - Se descargará un archivo `.zip` que contiene `app-debug.apk`.
   - Transfiere el archivo `.apk` a tu teléfono **Oppo A58** e instálalo directamente.

---

## 🚀 Características Principales

- ⚡ **Curvas de Bézier Cúbicas Dinámicas**: Arrastre lento da **mayor precisión para apuntar fino**, mientras que arrastres rápidos aceleran la mira para giros de 180°/360° sin trabarse.
- 🛡️ **Tope de Velocidad Máxima ($v_{\text{max}}$)**: Límite configurable para evitar que la mira se dispare repentinamente si deslizas el dedo con fuerza.
- 🧹 **Filtro Suavizador de Ruido (EMA)**: Filtro de frecuencia para eliminar las lecturas erráticas o temblores del digitalizador táctil en pantallas gama media.
- 🎯 **Visualizador en Tiempo Real**: Panel con sliders táctiles y pad interactivo para probar la mira en tiempo real antes de guardar los cambios.
- ⚡ **Baja Latencia (Chrome Coalesced Events & Native Kotlin)**:
  - Captura eventos acoplados en navegador (`getCoalescedEvents()`).
  - Plugin personalizado en Kotlin (`TouchEnginePlugin.kt`) que lee eventos `MotionEvent` de Android directamente a nivel de ventana con 180Hz reales.

---

## 📂 Estructura del Repositorio

```
QW/
├── index.html                   # Interfaz PWA con panel de sliders y canvas
├── style.css                    # Sistema de diseño Obsidian Dark
├── engine.js                    # Motor dinámico de sensibilidad (Bézier + EMA filter)
├── engine.bundle.js             # Bundle autónomo del motor
├── sw.js                        # Service Worker inteligente para PWA offline
├── manifest.json                # Manifiesto Web App de PWA
├── package.json                 # Configuración de scripts y dependencias Capacitor
├── capacitor.config.json        # Configuración del proyecto Capacitor Android
├── TouchEnginePlugin.kt         # Plugin nativo en Kotlin para captura MotionEvent 180Hz
├── AndroidManifest.xml          # Permisos Android HIGH_SAMPLING_RATE_SENSORS
├── .gitignore                   # Archivos ignorados por Git
└── .github/
    └── workflows/
        └── build-apk.yml        # Autoconstrucción automática del APK en GitHub
```

---

## 🌐 Uso como PWA (Web App)

1. Puedes abrir `index.html` en Google Chrome en tu teléfono.
2. Presiona en el menú de Chrome de tres puntos `⋮` -> **Añadir a la pantalla de inicio** o **Instalar aplicación**.
3. ¡Listo! La app se ejecutará de forma independiente sin barra de navegador y con soporte completo offline mediante el Service Worker.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia MIT.
