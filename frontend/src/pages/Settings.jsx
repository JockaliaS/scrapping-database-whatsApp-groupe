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
  syncGroups,
  toggleGroup,
  testAlert,
  getSlackAuthUrl,
  getSlackStatus,
  disconnectSlack,
  getSlackChannels,
  syncSlackChannels,
  toggleSlackChannel,
  testSlackAlert,
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
  const [syncingGroups, setSyncingGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');

  // Slack
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackStatus, setSlackStatus] = useState('disconnected');
  const [slackTeamName, setSlackTeamName] = useState('');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [slackChannels, setSlackChannels] = useState([]);
  const [slackChannelSearch, setSlackChannelSearch] = useState('');
  const [syncingSlack, setSyncingSlack] = useState(false);
  const [slackResult, setSlackResult] = useState(null);
  const [testingSlackAlert, setTestingSlackAlert] = useState(false);
  const [slackAlertResult, setSlackAlertResult] = useState(null);

  // Collaborative
  const [collaborativeEnabled, setCollaborativeEnabled] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savingWa, setSavingWa] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [testAlertResult, setTestAlertResult] = useState(null);

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
        setSlackWebhookUrl(data.slack_webhook_url || '');
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

    getSlackStatus()
      .then((data) => {
        setSlackConnected(data.connected || false);
        setSlackStatus(data.status || 'disconnected');
        setSlackTeamName(data.team_name || '');
        if (data.connected) {
          getSlackChannels()
            .then((channels) => setSlackChannels(Array.isArray(channels) ? channels : []))
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Handle OAuth return from Slack
    const params = new URLSearchParams(window.location.search);
    const slackParam = params.get('slack');
    if (slackParam === 'success') {
      setSlackResult({ ok: true, message: 'Slack connecte avec succes !' });
      setTimeout(() => setSlackResult(null), 5000);
      // Clean URL
      window.history.replaceState({}, '', '/settings');
      // Reload Slack data
      getSlackStatus().then((data) => {
        setSlackConnected(data.connected || false);
        setSlackTeamName(data.team_name || '');
        if (data.connected) {
          getSlackChannels()
            .then((channels) => setSlackChannels(Array.isArray(channels) ? channels : []))
            .catch(() => {});
        }
      }).catch(() => {});
    } else if (slackParam === 'denied') {
      setSlackResult({ ok: false, message: 'Autorisation Slack refusee.' });
      setTimeout(() => setSlackResult(null), 5000);
      window.history.replaceState({}, '', '/settings');
    }
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
              {testAlertResult && (
                <div className={`p-3 rounded-lg flex gap-3 ${testAlertResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <span className={`material-symbols-outlined text-sm ${testAlertResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {testAlertResult.ok ? 'check_circle' : 'error'}
                  </span>
                  <p className={`text-xs ${testAlertResult.ok ? 'text-green-700' : 'text-red-700'}`}>{testAlertResult.message}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={async () => {
                    setSavingWa(true);
                    try {
                      await updateProfile({ alert_number: alertPhone });
                      setTestAlertResult({ ok: true, message: 'Numero sauvegarde.' });
                      setTimeout(() => setTestAlertResult(null), 3000);
                    } catch (e) {
                      setTestAlertResult({ ok: false, message: e.message });
                    }
                    setSavingWa(false);
                  }}
                  disabled={savingWa}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-2.5 px-6 rounded-lg transition-all shadow-md shadow-primary/20 disabled:opacity-50"
                >
                  {savingWa ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button
                  onClick={async () => {
                    setTestingAlert(true);
                    setTestAlertResult(null);
                    try {
                      await updateProfile({ alert_number: alertPhone });
                      const result = await testAlert();
                      setTestAlertResult({ ok: true, message: result.message || 'Alerte envoyee avec succes !' });
                    } catch (e) {
                      setTestAlertResult({ ok: false, message: e.message });
                    }
                    setTestingAlert(false);
                  }}
                  disabled={testingAlert || !alertPhone}
                  className="flex-1 flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-2.5 px-6 rounded-lg hover:bg-primary/5 transition-all disabled:opacity-50"
                >
                  {testingAlert ? (
                    <><span className="animate-spin material-symbols-outlined text-sm">progress_activity</span> Envoi...</>
                  ) : (
                    <><span className="material-symbols-outlined text-sm">send</span> Tester l'alerte</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Ma Connexion Slack */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">tag</span>
            <h2 className="text-2xl font-black tracking-tight">Ma Connexion Slack</h2>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-6">
            {/* Connection status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Statut</span>
                <span className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border ${
                  slackConnected
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}>
                  {slackConnected && <span className="size-1.5 bg-primary rounded-full animate-pulse"></span>}
                  {slackConnected ? `CONNECTE - ${slackTeamName}` : 'NON CONNECTE'}
                </span>
              </div>
              {slackConnected && (
                <button
                  onClick={async () => {
                    try {
                      await disconnectSlack();
                      setSlackConnected(false);
                      setSlackStatus('disconnected');
                      setSlackTeamName('');
                      setSlackChannels([]);
                      setSlackResult({ ok: true, message: 'Slack deconnecte.' });
                      setTimeout(() => setSlackResult(null), 3000);
                    } catch (e) {
                      setSlackResult({ ok: false, message: e.message });
                    }
                  }}
                  className="text-xs text-red-500 font-bold hover:underline"
                >
                  Deconnecter
                </button>
              )}
            </div>

            {/* Connect via OAuth */}
            {!slackConnected && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <p className="text-sm text-blue-800 font-medium">
                    Connectez votre workspace Slack en un clic. Radar pourra lire les messages de vos channels pour detecter des opportunites.
                  </p>
                  <p className="text-xs text-blue-600">
                    Permissions demandees : lecture des channels et de leur historique.
                  </p>
                </div>
                {slackResult && (
                  <div className={`p-3 rounded-lg flex gap-3 ${slackResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <span className={`material-symbols-outlined text-sm ${slackResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                      {slackResult.ok ? 'check_circle' : 'error'}
                    </span>
                    <p className={`text-xs ${slackResult.ok ? 'text-green-700' : 'text-red-700'}`}>{slackResult.message}</p>
                  </div>
                )}
                <button
                  onClick={async () => {
                    try {
                      const data = await getSlackAuthUrl();
                      if (data.url) {
                        window.location.href = data.url;
                      }
                    } catch (e) {
                      setSlackResult({ ok: false, message: e.message });
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 bg-[#4A154B] hover:bg-[#3a1139] text-white font-bold py-3 px-6 rounded-lg transition-all shadow-lg"
                >
                  <svg width="20" height="20" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="#36C5F0"/>
                    <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="#2EB67D"/>
                    <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="#ECB22E"/>
                    <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.25m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.25a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.386" fill="#E01E5A"/>
                  </svg>
                  Connecter avec Slack
                </button>
              </div>
            )}

            {/* Success message after OAuth */}
            {slackConnected && slackResult && (
              <div className={`p-3 rounded-lg flex gap-3 ${slackResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <span className={`material-symbols-outlined text-sm ${slackResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                  {slackResult.ok ? 'check_circle' : 'error'}
                </span>
                <p className={`text-xs ${slackResult.ok ? 'text-green-700' : 'text-red-700'}`}>{slackResult.message}</p>
              </div>
            )}

            {/* Slack Webhook URL for alerts */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Webhook URL pour alertes Slack</span>
                <input
                  className="rounded-lg border-slate-200 bg-background-light font-mono text-sm"
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  type="text"
                  value={slackWebhookUrl}
                  onChange={(e) => setSlackWebhookUrl(e.target.value)}
                />
              </label>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
                <span className="material-symbols-outlined text-amber-500 text-sm">warning</span>
                <p className="text-xs text-amber-700">Les opportunites detectees seront aussi envoyees sur ce channel Slack.</p>
              </div>
              {slackAlertResult && (
                <div className={`p-3 rounded-lg flex gap-3 ${slackAlertResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <span className={`material-symbols-outlined text-sm ${slackAlertResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {slackAlertResult.ok ? 'check_circle' : 'error'}
                  </span>
                  <p className={`text-xs ${slackAlertResult.ok ? 'text-green-700' : 'text-red-700'}`}>{slackAlertResult.message}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      await updateProfile({ slack_webhook_url: slackWebhookUrl });
                      setSlackAlertResult({ ok: true, message: 'Webhook sauvegarde.' });
                      setTimeout(() => setSlackAlertResult(null), 3000);
                    } catch (e) {
                      setSlackAlertResult({ ok: false, message: e.message });
                    }
                  }}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-2.5 px-6 rounded-lg transition-all shadow-md shadow-primary/20"
                >
                  Sauvegarder
                </button>
                <button
                  onClick={async () => {
                    setTestingSlackAlert(true);
                    setSlackAlertResult(null);
                    try {
                      await updateProfile({ slack_webhook_url: slackWebhookUrl });
                      const result = await testSlackAlert();
                      setSlackAlertResult({ ok: true, message: result.message || 'Alerte Slack envoyee !' });
                    } catch (e) {
                      setSlackAlertResult({ ok: false, message: e.message });
                    }
                    setTestingSlackAlert(false);
                  }}
                  disabled={testingSlackAlert || !slackWebhookUrl}
                  className="flex-1 flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-2.5 px-6 rounded-lg hover:bg-primary/5 transition-all disabled:opacity-50"
                >
                  {testingSlackAlert ? (
                    <><span className="animate-spin material-symbols-outlined text-sm">progress_activity</span> Envoi...</>
                  ) : (
                    <><span className="material-symbols-outlined text-sm">send</span> Tester l'alerte Slack</>
                  )}
                </button>
              </div>
            </div>

            {/* Slack channels */}
            {slackConnected && (
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Channels Slack surveilles</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">
                      {slackChannels.length} channel{slackChannels.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-bold text-primary">
                      {slackChannels.filter(c => c.is_monitored).length} en ecoute
                    </span>
                    <button
                      onClick={async () => {
                        setSyncingSlack(true);
                        try {
                          const channels = await syncSlackChannels();
                          setSlackChannels(Array.isArray(channels) ? channels : []);
                        } catch {}
                        setSyncingSlack(false);
                      }}
                      disabled={syncingSlack}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-all disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-sm ${syncingSlack ? 'animate-spin' : ''}`}>
                        {syncingSlack ? 'progress_activity' : 'refresh'}
                      </span>
                      {syncingSlack ? 'Sync...' : 'Rafraichir'}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Filtrer par nom..."
                  value={slackChannelSearch}
                  onChange={(e) => setSlackChannelSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-primary focus:border-primary"
                />
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Channel Slack</th>
                        <th className="px-4 py-3 text-center">Monitoring</th>
                        <th className="px-4 py-3">Membres</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {slackChannels
                        .filter(c => c.name?.toLowerCase().includes(slackChannelSearch.toLowerCase()))
                        .map((ch) => (
                        <tr key={ch.id} className={ch.is_monitored ? 'bg-primary/5' : ''}>
                          <td className="px-4 py-3 font-medium">#{ch.name}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={ch.is_monitored}
                              onChange={async () => {
                                setSlackChannels(prev =>
                                  prev.map(c => c.id === ch.id ? { ...c, is_monitored: !c.is_monitored } : c)
                                );
                                try {
                                  await toggleSlackChannel(ch.id);
                                } catch {
                                  setSlackChannels(prev =>
                                    prev.map(c => c.id === ch.id ? { ...c, is_monitored: !c.is_monitored } : c)
                                  );
                                }
                              }}
                              className="rounded text-primary focus:ring-primary w-5 h-5"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-400">{ch.num_members || 0}</td>
                        </tr>
                      ))}
                      {slackChannels.length === 0 && (
                        <tr>
                          <td colSpan="3" className="px-4 py-6 text-center text-slate-400">Aucun channel Slack</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
              <button
                onClick={async () => {
                  setSyncingGroups(true);
                  try {
                    const data = await syncGroups();
                    setGroups(Array.isArray(data) ? data : []);
                  } catch {
                    // ignore
                  }
                  setSyncingGroups(false);
                }}
                disabled={syncingGroups}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-all disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-sm ${syncingGroups ? 'animate-spin' : ''}`}>
                  {syncingGroups ? 'progress_activity' : 'refresh'}
                </span>
                {syncingGroups ? 'Sync...' : 'Rafraichir'}
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-4">
              <input
                type="text"
                placeholder="Filtrer par nom..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-primary focus:border-primary"
              />
            </div>
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
                  {groups.filter((g) => g.name?.toLowerCase().includes(groupSearch.toLowerCase())).map((group) => (
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
