import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../api';

const GROUPS = [
  {
    key: 'allowedSenderNumbers',
    title: 'Pengirim WhatsApp',
    description: 'Nomor yang diizinkan memicu bot',
    placeholder: 'Contoh: 628123456789',
    type: 'tel',
  },
  {
    key: 'emailTo',
    title: 'Email TO',
    description: 'Penerima utama email nominasi',
    placeholder: 'nama@perusahaan.com',
    type: 'email',
  },
  {
    key: 'emailCc',
    title: 'Email CC',
    description: 'Penerima tembusan email',
    placeholder: 'nama@perusahaan.com',
    type: 'email',
  },
];

function createEmptySettings() {
  return { allowedSenderNumbers: [], emailTo: [], emailCc: [] };
}

export function SettingsPanel() {
  const [settings, setSettings] = useState(createEmptySettings);
  const [original, setOriginal] = useState(createEmptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getSettings(controller.signal)
      .then((result) => {
        setSettings(result);
        setOriginal(result);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMessage({ type: 'error', text: error.message });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const updateItem = (key, index, value) => {
    setSettings((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => itemIndex === index ? value : item),
    }));
    setMessage(null);
  };

  const addItem = (key) => {
    setSettings((current) => ({ ...current, [key]: [...current[key], ''] }));
    setMessage(null);
  };

  const removeItem = (key, index) => {
    setSettings((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
    setMessage(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveSettings(settings);
      setSettings(result.settings);
      setOriginal(result.settings);
      setMessage({ type: 'success', text: 'Pengaturan tersimpan dan langsung aktif.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(settings) !== JSON.stringify(original);

  return (
    <section className="panel settings-panel fade-in">
      <div className="settings-heading">
        <div className="panel-title">
          <h2>Pengaturan Penerima & Pengirim</h2>
          <p>Tambah, edit, atau hapus daftar operasional bot tanpa restart.</p>
        </div>
        <span className="live-badge">Langsung aktif</span>
      </div>

      {loading ? <p className="settings-loading">Memuat pengaturan…</p> : (
        <form onSubmit={submit}>
          <div className="settings-grid">
            {GROUPS.map((group) => (
              <div className="settings-group" key={group.key}>
                <div className="settings-group-title">
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                  <span>{settings[group.key].length}</span>
                </div>
                <div className="settings-list">
                  {settings[group.key].map((item, index) => (
                    <div className="settings-row" key={`${group.key}-${index}`}>
                      <input
                        type={group.type}
                        value={item}
                        placeholder={group.placeholder}
                        aria-label={`${group.title} ${index + 1}`}
                        onChange={(event) => updateItem(group.key, index, event.target.value)}
                      />
                      <button
                        type="button"
                        className="delete-setting"
                        title="Hapus"
                        aria-label={`Hapus ${group.title} ${index + 1}`}
                        onClick={() => removeItem(group.key, index)}
                      >×</button>
                    </div>
                  ))}
                  {settings[group.key].length === 0 && (
                    <p className={`settings-empty ${group.key === 'allowedSenderNumbers' ? 'warning' : ''}`}>
                      {group.key === 'allowedSenderNumbers'
                        ? 'Kosong berarti semua pengirim di grup diizinkan.'
                        : 'Belum ada data.'}
                    </p>
                  )}
                </div>
                <button type="button" className="add-setting" onClick={() => addItem(group.key)}>
                  + Tambah {group.title}
                </button>
              </div>
            ))}
          </div>
          <div className="settings-actions">
            <div aria-live="polite">
              {message && <span className={`settings-message ${message.type}`}>{message.text}</span>}
            </div>
            <button className="save-settings" type="submit" disabled={!dirty || saving}>
              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}