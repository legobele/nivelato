# Registros DNS para Resend: nivelatolabs.com

Zona Cloudflare: `b6ed2c1206b52d33eac7697aca4ae0ae`
Fecha: 2026-10-05. Agregados vía API de Cloudflare.

## Agregados (activos)

### 1. SPF (merge con iCloud, solo puede haber UN registro SPF)

- **Tipo:** TXT
- **Nombre:** `nivelatolabs.com`
- **Valor:** `v=spf1 include:icloud.com include:resend.com ~all`
- **TTL:** 3600, **proxy:** OFF (DNS only)
- **Nota:** antes era `v=spf1 include:icloud.com ~all` (del setup de iCloud
  Mail). Se hizo merge en vez de reemplazar, para no romper el correo de
  iCloud. Resend documenta `include:resend.com` como valor canónico; si el
  dashboard de Resend pidiera otro include, se ajusta aquí.

### 2. DMARC

- **Tipo:** TXT
- **Nombre:** `_dmarc`
- **Valor:** `v=DMARC1; p=none; rua=mailto:lebron@nivelatolabs.com`
- **TTL:** 3600, **proxy:** OFF
- **Nota:** `p=none` = solo monitoreo al inicio. Cuando el volumen sea
  estable y los reportes estén limpios, subir a `p=quarantine`.

## Pendiente (requiere el dashboard de Resend)

### 3. DKIM: NO agregar a ciegas

Los valores DKIM de Resend son **únicos por dominio** y solo los muestra el
dashboard después de agregar `nivelatolabs.com` en
https://resend.com/domains. Típicamente son 2 registros así:

- **Tipo:** CNAME (o TXT, según lo que pida el dashboard)
- **Nombre:** `resend._domainkey.nivelatolabs.com`
- **Valor:** `resend._domainkey.<id-único>.wl.resend.com` (lo da Resend)
- **Nombre:** `resend2._domainkey.nivelatolabs.com`
- **Valor:** `resend2._domainkey.<id-único>.wl.resend.com` (lo da Resend)

Pasos:

1. Resend → Domains → Add Domain → `nivelatolabs.com`.
2. Copiar los 2 valores DKIM exactos que muestre.
3. Agregarlos en Cloudflare con proxy OFF, o pedirle a Lux que los agregue
   vía API (ya tiene el patrón en `~/workspace/skills/cloudflare/`).
4. Resend → Verify. Deben salir SPF, DKIM y DMARC en verde.

## Verificación

```bash
dig +short TXT nivelatolabs.com              # debe incluir include:resend.com
dig +short TXT _dmarc.nivelatolabs.com       # v=DMARC1; p=none; ...
dig +short CNAME resend._domainkey.nivelatolabs.com   # tras el paso DKIM
```
