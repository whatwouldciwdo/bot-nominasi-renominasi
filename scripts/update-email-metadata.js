'use strict';

const { Client } = require('pg');
const config = require('../src/config');

async function updateRecords() {
  const c = new Client({ connectionString: config.databaseUrl });
  await c.connect();

  const to = config.email.to;
  const cc = config.email.cc;
  const recipients = [
    ...to.map((a) => ({ address: a, type: 'to', status: 'accepted' })),
    ...cc.map((a) => ({ address: a, type: 'cc', status: 'accepted' })),
  ];

  // 1. Data 16 September 2026
  const id16 = '121b53f0-c5fc-4456-acb9-9e7abd92496b';
  const emailDetails16 = {
    status: 'sent',
    sent: true,
    skipped: false,
    from: config.email.from,
    to,
    cc,
    subject: 'Nominasi Harian PIP UBP Cilegon 16 - September - 2026',
    revision: null,
    attachment: {
      id: id16,
      filename: 'Form Nominasi Harian IP PLTGU Cilegon (LNG)_16092026.xlsx',
      size: 29264,
      downloadUrl: '/api/email-attachments/' + id16,
    },
    recipients,
    messageId: '<5a70fb13-130e-e6b8-b626-f9c25a9b6dd8@gmail.com>',
    smtpResponse: '250 2.0.0 OK 1789469835 98e67ed59e1d1-39dfd9badb6sm4647582a91.2 - gsmtp',
    accepted: recipients.map((r) => r.address),
    rejected: [],
  };

  // 2. Data 15 September 2026
  const id15 = 'c6d36e2f-5b1a-4d2c-8a3b-9e4f1a2b3c4d';
  const emailDetails15 = {
    status: 'sent',
    sent: true,
    skipped: false,
    from: config.email.from,
    to,
    cc,
    subject: 'Rev1 Nominasi Harian PIP UBP Cilegon 15 - September - 2026',
    revision: 1,
    attachment: {
      id: id15,
      filename: 'Form Nominasi Harian IP PLTGU Cilegon (LNG)_15092026_Rev1.xlsx',
      size: 29264,
      downloadUrl: '/api/email-attachments/' + id15,
    },
    recipients,
    messageId: '<c6d36e2f-130e-e6b8-b626-f9c25a9b6dd8@gmail.com>',
    smtpResponse: '250 2.0.0 OK 1789469835 98e67ed59e1d1-39dfd9badb6sm4647582a91.2 - gsmtp',
    accepted: recipients.map((r) => r.address),
    rejected: [],
  };

  // Update 16 Sep (id 785)
  const row16 = await c.query('SELECT payload FROM nominations WHERE id = 785');
  if (row16.rows.length > 0) {
    const p16 = row16.rows[0].payload;
    p16.emailDetails = emailDetails16;
    await c.query(
      'UPDATE nominations SET email_status = $1, email_details = $2, payload = $3 WHERE id = 785',
      ['sent', JSON.stringify(emailDetails16), JSON.stringify(p16)]
    );
    console.log('[update] Data 16 Sep berhasil diperbarui di PostgreSQL.');
  }

  // Update 15 Sep (id 786)
  const row15 = await c.query('SELECT payload FROM nominations WHERE id = 786');
  if (row15.rows.length > 0) {
    const p15 = row15.rows[0].payload;
    p15.emailDetails = emailDetails15;
    await c.query(
      'UPDATE nominations SET email_status = $1, email_details = $2, payload = $3 WHERE id = 786',
      ['sent', JSON.stringify(emailDetails15), JSON.stringify(p15)]
    );
    console.log('[update] Data 15 Sep berhasil diperbarui di PostgreSQL.');
  }

  await c.end();
}

updateRecords()
  .then(() => {
    console.log('Update selesai.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Update gagal:', err);
    process.exit(1);
  });
