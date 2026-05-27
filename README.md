# 🚀 MAGO Drinks POS — Guía de instalación con Firebase

Todo gratis. Sin tarjeta de crédito. ~15 minutos.

---

## PASO 1 — Crear proyecto en Firebase (base de datos)

1. Andá a **https://firebase.google.com** y hacé clic en **"Ir a la consola"**
2. Iniciá sesión con tu cuenta de Google (Gmail)
3. Hacé clic en **"Crear un proyecto"**
   - Nombre: `mago-pos` (o el que quieras)
   - Google Analytics: podés desactivarlo
   - Hacé clic en **"Crear proyecto"**
4. Esperá ~30 segundos

---

## PASO 2 — Crear la base de datos (Firestore)

1. En el menú izquierdo, hacé clic en **"Compilación" → "Firestore Database"**
2. Hacé clic en **"Crear base de datos"**
3. Elegí **"Comenzar en modo de producción"** → Siguiente
4. Elegí la región **"southamerica-east1 (São Paulo)"** → Listo
5. Esperá que se cree

### Configurar permisos de acceso:

6. En Firestore, hacé clic en la pestaña **"Reglas"**
7. Reemplazá todo el contenido con esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

8. Hacé clic en **"Publicar"**

---

## PASO 3 — Obtener las claves de configuración

1. Hacé clic en el **ícono de engranaje ⚙️** (arriba a la izquierda) → **"Configuración del proyecto"**
2. Bajá hasta **"Tus apps"** → hacé clic en **"</> Web"**
3. Registrá la app con el nombre `mago-pos-web` → **"Registrar app"**
4. Vas a ver un bloque de código así:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "mago-pos.firebaseapp.com",
  projectId: "mago-pos",
  storageBucket: "mago-pos.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. Anotá esos 6 valores — los vas a necesitar en el Paso 5

---

## PASO 4 — Subir el código a GitHub

1. Creá cuenta gratis en **https://github.com**
2. Hacé clic en **"New repository"** → nombre: `mago-pos` → **"Create repository"**
3. Descomprimí el ZIP en tu computadora
4. Instalá Git si no lo tenés: **https://git-scm.com/downloads**
5. Abrí una terminal dentro de la carpeta `mago-pos` y ejecutá:

```bash
git init
git add .
git commit -m "inicio"
git remote add origin https://github.com/TU_USUARIO/mago-pos.git
git push -u origin main
```

---

## PASO 5 — Publicar en Vercel (hosting gratis)

1. Andá a **https://vercel.com** → "Sign Up" con tu cuenta de GitHub
2. Hacé clic en **"New Project"** → importá el repositorio `mago-pos`
3. Antes de hacer Deploy, abrí **"Environment Variables"** y agregá estas 6 variables
   (copiá los valores del Paso 3):

| Nombre                            | Valor de ejemplo            |
|-----------------------------------|-----------------------------|
| VITE_FIREBASE_API_KEY             | AIzaSy...                   |
| VITE_FIREBASE_AUTH_DOMAIN         | mago-pos.firebaseapp.com    |
| VITE_FIREBASE_PROJECT_ID          | mago-pos                    |
| VITE_FIREBASE_STORAGE_BUCKET      | mago-pos.appspot.com        |
| VITE_FIREBASE_MESSAGING_SENDER_ID | 123456789                   |
| VITE_FIREBASE_APP_ID              | 1:123456789:web:abc123      |

4. Hacé clic en **"Deploy"**
5. En ~2 minutos tenés tu URL pública: `https://mago-pos.vercel.app`

---

## ✅ ¡Listo!

La app queda disponible desde cualquier celular, tablet o computadora.
Los productos y ventas se guardan automáticamente en Firebase.

---

## Actualizar la app en el futuro

Cada vez que modifiques algo, ejecutá:

```bash
git add .
git commit -m "descripción"
git push
```

Vercel actualiza la web automáticamente en ~1 minuto.

---

## Estructura del proyecto

```
mago-pos/
├── public/
│   └── logo.png              ← Logo de MAGO Drinks
├── src/
│   ├── lib/
│   │   └── firebase.js       ← Conexión a Firebase
│   ├── App.jsx               ← Toda la aplicación
│   └── main.jsx              ← Punto de entrada
├── .env.example              ← Plantilla de variables
├── index.html
├── package.json
├── README.md                 ← Este archivo
└── vite.config.js
```
