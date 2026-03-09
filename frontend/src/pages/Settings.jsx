import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import KeywordChips from '../components/KeywordChips';
import useWebSocket from '../hooks/useWebSocket';
import useAuth from '../hooks/useAuth';
import {
  getProfile,
  updateProfile,
  generateKeywords,
  getWhatsAppQR,
  getWhatsAppStatus,
  disconnectWhatsApp,
  getGroups,
  toggleGroup,
} from '../services/api';

export default function Settings() {
  const { connected } = useWebSocket();
  const { user } = useAuth();

  // Profile
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // AI Profile
  const [rawText, setRawText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [intentions, setIntentions] = useState([]);
  const [scoreThreshold, setScoreThreshold] = useState(75);

  // WhatsApp
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waNumber, setWaNumber] = useState('');
  const [waInstanceName, setWaInstanceName] = useState('');
  const [waWebhookUrl, setWaWebhookUrl] = useState('');
  const [alertPhone, setAlertPhone] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [webhookCopied, setWebhookCopied] = useState(false);

  // Alert Template
  const [alertTemplate, setAlertTemplate] = useState('');

  // Groups
  const [groups, setGroups] = useState([]);

  // Collaborative
  const [collaborativeEnabled, setCollaborativeEnabled] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => {
        // User fields (merged by backend)
        setName(data.full_name || '');
        setEmail(data.email || '');
        // Profile fields
        setRawText(data.raw_text || '');
        setKeywords(data.keywords || []);
        setIntentions(data.intentions || []);
        setScoreThreshold(data.min_score || 75);
        setAlertPhone(data.alert_number || '');
        setAlertTemplate(data.alert_template || '');
        setCollaborativeEnabled(data.sharing_enabled || false);
      })
      .catch(() => {});

    getWhatsAppStatus()
      .then((data) => {
        setWaStatus(data.status || 'disconnected');
        setWaNumber(data.connected_number || '');
        setWaInstanceName(data.instance_name || '');
        setWaWebhookUrl(data.webhook_url || '');
      })
      .catch(() => {});

    getGroups()
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ full_name: name, email });
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleSaveAI = async () => {
    setSaving(true);
    try {
      await updateProfile({
        keywords,
        intentions,
        min_score: scoreThreshold,
        raw_text: rawText,
        alert_number: alertPhone,
        alert_template: alertTemplate,
        sharing_enabled: collaborativeEnabled,
      });
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleRegenerate = async () => {
    if (!rawText.trim()) return;
    try {
      const result = await generateKeywords(rawText);
      setKeywords(result.keywords || []);
      setIntentions(result.intentions || []);
    } catch {
      // ignore
    }
  };

  const handleToggleGroup = (id) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_monitored: !g.is_monitored } : g))
    );
    toggleGroup(id).catch(() => {
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, is_monitored: !g.is_monitored } : g))
      );
    });
  };

  const monitoredCount = groups.filter(g => g.is_monitored).length;
  const templateVars = ['{{score}}', '{{contact}}', '{{message}}', '{{groupe}}', '{{lien}}'];

  return (
    <div className="bg-background-light text-slate-900 min-h-screen flex flex-col">
      <Navbar connected={connected} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 space-y-12">
        {/* Mon Profil */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">person</span>
            <h2 className="text-2xl font-black tracking-tight">Mon Profil</h2>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="relative group">
                <div className="size-32 rounded-2xl shadow-lg border-4 border-white bg-primary/10 flex items-center justify-center text-primary text-4xl font-black">
                  {name?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Nom complet</span>
                  <input
                    className="rounded-lg border-slate-200 bg-background-light focus:ring-primary focus:border-primary"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Email</span>
                  <input
                    className="rounded-lg border-slate-200 bg-background-light focus:ring-primary focus:border-primary"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90 text-white font-bold py-2.5 px-8 rounded-lg transition-all shadow-md shadow-primary/20 disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mon Profil IA */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">psychology</span>
            <h2 className="text-2xl font-black tracking-tight">Mon Profil IA</h2>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
            <div className="bg-background-light p-4 rounded-lg border-l-4 border-primary italic text-slate-600">
              {rawText || 'Aucune description de profil definie.'}
            </div>
            <div className="space-y-3">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Mots-cles surveilles</span>
              <KeywordChips keywords={keywords} onChange={setKeywords} />
            </div>
            <div className="space-y-3">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Intentions detectees</span>
              <div className="flex flex-wrap gap-2">
                {intentions.map((intent, i) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">{intent}</span>
                ))}
                {intentions.length === 0 && <span className="text-sm text-slate-400">Aucune intention</span>}
              </div>
            </div>
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Score minimum de pertinence</span>
                <span className="text-primary font-bold font-mono">{scoreThreshold}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
            <div className="flex justify-between">
              <button onClick={handleRegenerate} className="flex items-center gap-2 text-primary font-bold text-sm hover:underline">
                <span className="material-symbols-outlined text-sm">refresh</span> Regenerer par l'IA
              </button>
              <button onClick={handleSaveAI} disabled={saving} className="bg-primary hover:bg-primary/90 text-white font-bold py-2 px-6 rounded-lg transition-all disabled:opacity-50">
                Sauvegarder
              </button>
            </div>
          </div>
        </section>

        {/* Ma Connexion WhatsApp */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">hub</span>
            <h2 className="text-2xl font-black tracking-tight">Ma Connexion WhatsApp</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center">
              <div className="size-48 bg-slate-100 rounded-xl flex items-center justify-center mb-4 relative overflow-hidden">
                {qrCode ? (
                  <img src={qrCode} alt="QR Code" className="w-40 h-40 object-contain" />
                ) : (
                  <span className="material-symbols-outlined text-slate-300 text-6xl">qr_code_2</span>
                )}
              </div>
              <p className="text-sm text-slate-500 mb-4">Scannez pour reconnecter votre compte</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-5">
              <div>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Statut</span>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border ${
                    waStatus === 'connected' || waStatus === 'open'
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>
                    {(waStatus === 'connected' || waStatus === 'open') && <span className="size-1.5 bg-primary rounded-full animate-pulse"></span>}
                    {waStatus === 'connected' || waStatus === 'open' ? 'CONNECTE' : waStatus.toUpperCase()}
                  </span>
                </div>
              </div>
              {waInstanceName && (
                <div>
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Instance</span>
                  <p className="mt-1 font-mono text-sm text-slate-700">{waInstanceName}</p>
                </div>
              )}
              <div>
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Numero connecte</span>
                <p className="mt-1 font-mono text-lg">{waNumber || 'Non renseigne'}</p>
              </div>
              {waWebhookUrl && (
                <div>
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Webhook URL</span>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700 break-all select-all">
                      {waWebhookUrl}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(waWebhookUrl);
                        setWebhookCopied(true);
                        setTimeout(() => setWebhookCopied(false), 2000);
                      }}
                      className={`shrink-0 p-2 rounded-lg text-xs font-bold transition-all ${
                        webhookCopied
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{webhookCopied ? 'done' : 'content_copy'}</span>
                    </button>
                  </div>
                </div>
              )}
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Numero pour alertes (WhatsApp)</span>
                <input
                  className="rounded-lg border-slate-200 bg-background-light font-mono"
                  placeholder="+33 6 00 00 00 00"
                  type="text"
                  value={alertPhone}
                  onChange={(e) => setAlertPhone(e.target.value)}
                />
              </label>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
                <span className="material-symbols-outlined text-amber-500 text-sm">warning</span>
                <p className="text-xs text-amber-700">Ce numero recevra les notifications de detection d'opportunites en temps reel.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Mon Modele d'Alerte */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">chat_bubble</span>
            <h2 className="text-2xl font-black tracking-tight">Mon Modele d'Alerte</h2>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs font-semibold text-slate-400 self-center mr-2 uppercase tracking-widest">Variables:</span>
              {templateVars.map((v) => (
                <button
                  key={v}
                  onClick={() => setAlertTemplate((prev) => prev + ' ' + v)}
                  className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-mono border border-slate-200 hover:bg-primary/10 hover:border-primary/30 transition-colors"
                >
                  <code>{v}</code>
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-xl border-slate-200 bg-background-light font-mono text-sm focus:ring-primary focus:border-primary"
              placeholder="Ecrivez votre modele ici..."
              rows={5}
              value={alertTemplate}
              onChange={(e) => setAlertTemplate(e.target.value)}
            />
            <div className="mt-4 flex justify-between items-center">
              <p className="text-xs text-slate-400">Utilisez le Markdown basique de WhatsApp (*gras*, _italique_).</p>
              <button className="flex items-center gap-2 px-4 py-2 border border-primary text-primary font-bold rounded-lg hover:bg-primary/5 transition-colors">
                <span className="material-symbols-outlined text-sm">visibility</span> Previsualiser
              </button>
            </div>
          </div>
        </section>

        {/* Mes Groupes */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">groups</span>
            <h2 className="text-2xl font-black tracking-tight">Mes Groupes</h2>
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm text-slate-500">{groups.length} groupe{groups.length > 1 ? 's' : ''}</span>
              <span className="text-sm font-bold text-primary">{monitoredCount} en ecoute</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Groupe WhatsApp</th>
                    <th className="px-6 py-4 text-center">Monitoring</th>
                    <th className="px-6 py-4">Membres</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.map((group) => (
                    <tr key={group.id} className={group.is_monitored ? 'bg-primary/5' : ''}>
                      <td className="px-6 py-4 font-medium">{group.name || '(sans nom)'}</td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={group.is_monitored}
                          onChange={() => handleToggleGroup(group.id)}
                          className="rounded text-primary focus:ring-primary w-5 h-5"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-400">{group.member_count || 0}</td>
                    </tr>
                  ))}
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-6 py-8 text-center text-slate-400">Aucun groupe</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Partage Collaboratif */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">share</span>
            <h2 className="text-2xl font-black tracking-tight">Partage Collaboratif</h2>
          </div>
          <div className="bg-primary/5 p-6 rounded-xl border border-primary/20 flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1 space-y-2">
              <h3 className="text-lg font-bold">Activer le reseau Radar</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Partagez anonymement les opportunites que vous ne traitez pas et recevez en retour celles du reseau qui correspondent a votre profil IA.
              </p>
              <div className="flex gap-6 pt-4">
                <div className="text-center">
                  <p className="text-2xl font-black text-primary font-mono">0</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Opportunites partagees</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-primary font-mono">0</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Opportunites recues</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-400">DESACTIVE</span>
              <button
                onClick={() => setCollaborativeEnabled(!collaborativeEnabled)}
                className={`w-14 h-7 rounded-full relative cursor-pointer shadow-inner transition-colors ${collaborativeEnabled ? 'bg-primary' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 size-5 bg-white rounded-full shadow transition-all ${collaborativeEnabled ? 'right-1' : 'left-1'}`}></div>
              </button>
              <span className="text-sm font-bold text-primary">ACTIVE</span>
            </div>
          </div>
        </section>

        {/* Zone de Danger */}
        <section className="pt-10 border-t border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-red-500">dangerous</span>
            <h2 className="text-2xl font-black tracking-tight text-red-600">Zone de Danger</h2>
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <button className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-bold transition-colors">
              <span className="material-symbols-outlined text-sm">download</span> Exporter mes donnees
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-red-600 text-white hover:bg-red-700 font-bold transition-shadow shadow-lg shadow-red-200">
              <span className="material-symbols-outlined text-sm">delete</span> Supprimer mes donnees
            </button>
          </div>
        </section>
      </main>

      <footer className="py-10 text-center text-slate-400 text-xs border-t border-slate-100">
        &copy; 2024 RADAR - WhatsApp Monitoring SaaS. Built for builders.
      </footer>
    </div>
  );
}
