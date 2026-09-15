# Panduan Deployment Bot Nominasi & Re-Nominasi di Ubuntu (Docker)

Dokumen ini menjelaskan cara melakukan deployment aplikasi Bot Nominasi & Re-Nominasi di server Linux Ubuntu menggunakan Docker dan Docker Compose.

---

## 1. Prasyarat Server Ubuntu

Pastikan server Ubuntu telah terinstall:
- **Docker Engine** (versi 24+)
- **Docker Compose** (versi 2+)
- Akses jaringan ke:
  - PostgreSQL: `10.8.140.69:5432`
  - WAHA: `10.8.140.67:3010`
  - SMTP Gmail: `smtp.gmail.com:465`

Uji koneksi dari Ubuntu:
```bash
nc -zv 10.8.140.69 5432
nc -zv 10.8.140.67 3010
```

---

## 2. Clone Repositori

```bash
git clone https://github.com/whatwouldciwdo/bot-nominasi-renominasi.git
cd bot-nominasi-renominasi
```

---

## 3. Konfigurasi Environment (`.env`)

Salin template file `.env`:
```bash
cp .env.example .env
nano .env
```

Pastikan variabel berikut terisi:
```env
PORT=3001

# PostgreSQL Database
DATABASE_URL=postgresql://postgres:Cilego2026.@10.8.140.69:5432/nomrenom_db

# WAHA (WhatsApp HTTP API)
WHATSAPP_API_URL=http://10.8.140.67:3010
WHATSAPP_API_KEY=WahaCilegon-2026
WHATSAPP_SESSION=nominasi-renominasi

# WhatsApp Group & Keywords
TARGET_GROUP_ID=628111096143-1619431213@g.us
TRIGGER_KEYWORDS=Nominasi PGN,ReNominasi PGN
REPLY_WITH_SUMMARY=true
REPLY_AS_QUOTE=true

# SMTP Email
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=operasiubpcilegon@gmail.com
SMTP_PASS=oqwb ojzq hvts utwi
EMAIL_FROM=operasiubpcilegon@gmail.com
```

---

## 4. Menjalankan Aplikasi via Docker

Jalankan container bot:
```bash
docker compose up -d --build
```

Periksa status container:
```bash
docker compose ps
docker compose logs -f bot
```

---

## 5. Hubungkan Webhook WAHA ke Server Ubuntu

Agar bot menerima pesan dari WhatsApp grup, webhook pada sesi `nominasi-renominasi` di server WAHA (`10.8.140.67:3010`) harus mengarah ke IP Ubuntu Anda pada port `3001`.

Misalkan IP server Ubuntu Anda adalah `10.8.140.70`, jalankan perintah ini di Ubuntu (atau via curl/Postman):

```bash
curl -X PUT "http://10.8.140.67:3010/api/sessions/nominasi-renominasi" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: WahaCilegon-2026" \
  -d '{
    "config": {
      "webhooks": [
        {
          "url": "http://<IP_UBUNTU>:3001/webhook",
          "events": ["message", "message.edited"]
        }
      ]
    }
  }'
```

*(Ganti `<IP_UBUNTU>` dengan alamat IP server Ubuntu Anda)*

---

## 6. Verifikasi & Pengujian

1. **Cek Healthcheck:**
   ```bash
   curl http://localhost:3001/health
   ```
   Output yang diharapkan:
   ```json
   {"status":"ok","uptime":...,"db":"connected"}
   ```

2. **Cek Status WAHA:**
   ```bash
   curl http://localhost:3001/api/waha-status
   ```

3. **Buka Dashboard Web:**
   Buka browser ke:
   `http://<IP_UBUNTU>:3001/dashboard`

4. **Kirim Pesan Uji:**
   Kirim pesan nominasi di grup WhatsApp target dan periksa log bot:
   ```bash
   docker compose logs -f --tail=50 bot
   ```

---

## 7. Pemeliharaan (Maintenance)

- **Restart bot:**
  ```bash
  docker compose restart bot
  ```
- **Update ke versi terbaru dari GitHub:**
  ```bash
  git pull origin main
  docker compose up -d --build
  ```
- **Backup data:**
  Seluruh nominasi dan histori tersimpan langsung di database PostgreSQL `nomrenom_db` di server `10.8.140.69:5432`. Salinan lokal file Excel lampiran tersimpan di folder `./logs/` pada server Ubuntu.
