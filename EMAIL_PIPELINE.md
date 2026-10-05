# Nivelato: Pipeline de correos (EMAIL_PIPELINE.md)

Todos los correos de Nivelato salen de **noreply@nivelatolabs.com** vía
**Resend**. Proveedor: Resend. Dominio verificado: nivelatolabs.com
(DNS en Cloudflare).

## 1. Arquitectura: callables, no triggers

Los eventos de correo se reportan con **Cloud Functions callables** que la
app invoca explícitamente, en vez de triggers de Firestore. Decisión tomada
el 2026-10-05 por el modo BYOB (bring-your-own-backend):

- Un taller puede pegar su propio proyecto de Firebase en
  Ajustes → Backend y la app habla con SU proyecto. Los datos nunca tocan
  el proyecto central de Nivelato.
- Un trigger de Firestore en el proyecto central jamás vería esos eventos.
  En cambio, la app llama a las funciones centrales pasando el payload del
  evento, y los correos salen igual sin importar dónde vivan los datos.
- Las funciones son un "tubo tonto con rate limit": validan, limitan y
  envían. La inteligencia (quién debe recibir qué) vive en la app o, en el
  backend default, en el fan-out del servidor (ver §3).

Funciones (región `us-central1`, en `functions/index.js`):

| Función | Qué hace |
|---|---|
| `requestWelcomeEmail({email, name})` | Correo de bienvenida en español. La app la llama tras el signup (ver `login.html`, `maybeSendWelcome`). Rate limit: 3/día por correo. |
| `requestPasswordReset({email})` | Genera el enlace con el Admin SDK del proyecto central y lo envía desde noreply@nivelatolabs.com (evita el remitente firebaseapp.com). Si el correo no existe en el proyecto central lanza `not-found` y la app cae al `sendPasswordResetEmail` del SDK (remitente default). Rate limit: 5/día por correo. |
| `reportQuoteEvent({type, ...})` | Notificaciones de cotizaciones. `type`: `created`, `updated`, `ready`. Dos modos (ver §3). |

## 2. Dónde va la API key de Resend (ACCIÓN REQUERIDA)

La key **no** está en el código. Las funciones la leen de
`functions.config().resend.api_key` (con fallback a `RESEND_API_KEY` en el
entorno, útil para el emulador).

Giulia debe correr esto una vez (Firebase CLI autenticado, en
`~/workspace/nivelato-repo/functions`):

```bash
firebase functions:config:set resend.api_key="PEGA_AQUI_LA_KEY_DE_RE SEND"
firebase deploy --only functions
```

Notas:

- El valor nunca se commitea. `firebase functions:config:get` lo muestra
  solo a quien tenga acceso al proyecto.
- Para el emulador local: crea `functions/.env` con
  `RESEND_API_KEY=...` (ese archivo está en `.gitignore`, no se sube).
- Sin la key configurada, las funciones responden `failed-precondition`
  ("Email service not configured") en vez de romperse en silencio.

## 3. Fan-out de notificaciones

### Backend default (proyecto central = donde están los datos)

La app llama `reportQuoteEvent({type, companyId, quoteNumero, clienteNombre,
companyName, total, actorName})` **sin** `to`. La función, con el Admin SDK:

1. Lee `companies/{companyId}` → mapa `members`.
2. Para cada miembro (menos el actor): lee `users/{uid}` (email) y
   `notification_prefs/{uid}` (toggles).
3. Envía solo si el toggle correspondiente está en `true`
   (`created`→`newProject`, `updated`→`projectEdit`, `ready`→`quoteReady`).
   Sin doc de prefs = todo activado (defaults).

### Modo BYOB (datos en el proyecto del taller)

El proyecto central no puede leer el Firestore del taller, así que la app
resuelve los correos y los pasa explícitos: `reportQuoteEvent({type, ...,
to: "correo@ejemplo.com"})`, una llamada por destinatario. Limitación
conocida: las preferencias individuales de otros miembros no se pueden
consultar cross-project, así que la app notifica al equipo (menos el actor)
y cada taller decide su política. El toggle propio del actor no aplica aquí
porque él no se notifica a sí mismo.

### Puntos de integración en la app

- `login.html`: `maybeSendWelcome()` tras ambos signups (QGI y trial);
  enlace "¿Olvidaste tu contraseña?" → `doForgotPassword()` con fallback
  al SDK.
- `dashboard.html`: `notifyQuoteEvent(type, q)` tras guardar (created/
  updated) y tras marcar como enviada (ready). Fire-and-forget.
- `settings.html`: toggles de `notification_prefs/{uid}` + tarjeta de
  backend BYOB.

## 4. Preferencias (`notification_prefs/{uid}`)

```js
notification_prefs/{uid} = {
  welcomeEmail: boolean,  // correo de bienvenida (default true)
  newProject:   boolean,  // alguien creó una cotización (default true)
  projectEdit:  boolean,  // editaron una cotización (default true)
  quoteReady:   boolean,  // marcaron una cotización como enviada (default true)
  updatedAt:    timestamp
}
```

Reglas (`firestore.rules`, ya agregadas): el usuario solo lee/escribe su
propio doc, y solo esas cinco claves.

**Talleres BYOB**: peguen este mismo bloque en las reglas de SU proyecto,
o la tarjeta de Ajustes no podrá guardar preferencias:

```js
match /notification_prefs/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if request.auth != null && request.auth.uid == userId
    && request.resource.data.keys().hasOnly(
         ['welcomeEmail', 'newProject', 'projectEdit', 'quoteReady', 'updatedAt']);
}
```

## 5. DNS (Cloudflare, zona nivelatolabs.com)

Agregados el 2026-10-05 vía API (ver `EMAIL_DNS_RECORDS.md`):

| Tipo | Nombre | Valor | Estado |
|---|---|---|---|
| TXT | `nivelatolabs.com` | `v=spf1 include:icloud.com include:resend.com ~all` | Activo (merge con el SPF de iCloud, solo puede haber uno) |
| TXT | `_dmarc.nivelatolabs.com` | `v=DMARC1; p=none; rua=mailto:lebron@nivelatolabs.com` | Activo |
| CNAME | `resend._domainkey` / `resend2._domainkey` | **PENDIENTE** | Ver abajo |

**DKIM pendiente (requiere acción de Giulia)**: los valores DKIM de Resend
son únicos por dominio y solo aparecen en el dashboard de Resend después de
agregar el dominio:

1. Entra a https://resend.com/domains → Add Domain → `nivelatolabs.com`.
2. Copia los 2 registros DKIM que muestra (CNAME o TXT según lo que pida).
3. Agrégalos en Cloudflare (DNS only, sin proxy) o pídele a Lux que los
   agregue vía API.
4. Vuelve a Resend y dale a Verify.

Sin el DKIM verificado, Resend puede rehusar enviar desde el dominio o los
correos caen en spam. El SPF y el DMARC ya están listos.

## 6. Cómo probar

```bash
cd ~/workspace/nivelato-repo/functions
npm install                 # ya incluye resend
firebase deploy --only functions
```

1. **Config**: `firebase functions:config:get` debe mostrar `resend.api_key`.
2. **Welcome**: crea una cuenta de prueba en login.html → debe llegar el
   correo de bienvenida a noreply@nivelatolabs.com.
3. **Reset**: "¿Olvidaste tu contraseña?" → llega el correo con el botón.
   Revisa que el remitente sea noreply@nivelatolabs.com.
4. **Quotes**: crea una cotización con dos usuarios de prueba en el taller
   (uno con el toggle apagado) → solo el que lo tiene prendido recibe.
5. **Rate limits**: los contadores viven en `emailRateLimits/{clave}`.
6. **Headers**: en Gmail, "mostrar original" debe decir SPF/DKIM/DMARC pass
   (DKIM solo después del paso pendiente del §5).

## 7. Lo que falta del lado móvil (Android)

La app Android (`~/workspace/nivelato-android`) debe:

1. Tras el registro (Google Sign-In o email), crear
   `notification_prefs/{uid}` con los cuatro toggles en `true` y llamar a
   `requestWelcomeEmail` (callable del proyecto central,
   `us-central1`, vía `FirebaseFunctions.getInstance("us-central1")`
   apuntando explícito al proyecto `nivelato-app` aunque haya BYOB).
2. Tras guardar/actualizar/enviar cotización, llamar a `reportQuoteEvent`
   igual que `dashboard.html` (sección `notifyQuoteEvent`): modo fan-out
   con `companyId` en backend default, modo `to` explícito en BYOB.
3. Pantalla de ajustes: toggles de `notification_prefs` + formulario BYOB
   (los 6 campos, validación con lectura liviana, "volver al default").
   En Android el config personalizado va en SharedPreferences/DataStore
   en vez de localStorage.
4. Rebuild del bundle tras cualquier cambio en `webapp/`:
   `./gradlew assembleRelease` (ver `nivelato-android/AGENTS.md`).

Nota: el `apiKey` del backend propio en Android debe tratarse como las
demás claves públicas de Firebase (van en el cliente, es normal), nunca
mezclar con la key de Resend, que solo vive en Functions config.

## 8. Diseño visual (v1.1, 2026-10-05)

Refresh redondeado aplicado junto con este pipeline: todos los radios
subieron un escalón (`card` 12→18px, `modal` 16→24px, `sm` 8→12px, etc.),
sombras en dos capas más suaves, y nuevo token `shadow-lg`. Fuente:
`design-tokens/tokens.json` v1.1.0 (ver `design-tokens/tokens.css` y
`nivelato-design-system/design-system.md` §1.4). Android: `webapp/autism.css`
e `index.html` actualizados al mismo escalado; rebuild del bundle requerido
para que se vea en el APK.
