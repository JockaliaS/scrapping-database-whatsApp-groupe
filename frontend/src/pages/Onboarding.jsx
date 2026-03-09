import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateKeywords, updateProfile, connectWhatsApp, getWhatsAppQR, getWhatsAppStatus, getGroups, toggleGroup, connectExistingWhatsApp, listInstances } from '../services/api';
import KeywordChips from '../components/KeywordChips';
import useWebSocket from '../hooks/useWebSocket';

const STEPS = [
  { num: 1, title: 'Qui etes-vous ?' },
  { num: 2, title: 'Alertes' },
  { num: 3, title: 'WhatsApp' },
  { num: 4, title: 'Groupes' },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  // WebSocket for real-time QR and connection updates
  const { qrCode: wsQrCode, whatsappStatus: wsWhatsappStatus } = useWebSocket();

  // Step 1
  const [rawText, setRawText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [antiKeywords, setAntiKeywords] = useState([]);
  const [intentions, setIntentions] = useState([]);
  const [sector, setSector] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  // Step 2
  const [phone, setPhone] = useState('');
  const [scoreThreshold, setScoreThreshold] = useState(70);
  const [alertTemplate, setAlertTemplate] = useState('');

  // Step 3
  const [waPath, setWaPath] = useState(null); // null = choice, 'A' = new instance, 'B' = existing
  const [qrCode, setQrCode] = useState('');
  const [waStatus, setWaStatus] = useState('disconnected');
  const qrIntervalRef = useRef(null);

  // Path B
  const [existingInstanceName, setExistingInstanceName] = useState('');
  const [availableInstances, setAvailableInstances] = useState([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [connectingExisting, setConnectingExisting] = useState(false);
  const [pathBSuccess, setPathBSuccess] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);
  const [connectionChecks, setConnectionChecks] = useState(null);

  // Step 4
  const [groups, setGroups] = useState([]);

  // Listen for WebSocket QR updates (from global webhook qrcode.updated events)
  useEffect(() => {
    if (wsQrCode && step === 3 && waPath === 'A') {
      setQrCode(wsQrCode);
    }
  }, [wsQrCode, step, waPath]);

  // Listen for WebSocket connection updates (from global webhook connection.update events)
  useEffect(() => {
    if (wsWhatsappStatus === 'connected' && step === 3) {
      setWaStatus('connected');
      setQrCode('');
      clearInterval(qrIntervalRef.current);
    }
  }, [wsWhatsappStatus, step]);

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setAnalyzing(true);
    try {
      const result = await generateKeywords(rawText);
      setKeywords(result.keywords || []);
      setAntiKeywords(result.anti_keywords || []);
      setIntentions(result.intentions || []);
      setSector(result.sector || '');
      setAnalyzed(true);
    } catch {
      // fallback demo data
      setKeywords(['CRM', 'PME', 'Automatisation']);
      setIntentions(['MIGRATION CRM', 'CONSEIL DATA']);
      setSector('SERVICES B2B');
      setAnalyzed(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const [waError, setWaError] = useState('');
  const [waConnecting, setWaConnecting] = useState(false);

  // Step 3 Path A: Connect + Poll QR
  useEffect(() => {
    if (step === 3 && waPath === 'A') {
      let cancelled = false;

      const initWhatsApp = async () => {
        setWaConnecting(true);
        setWaError('');

        // First check current status
        try {
          const status = await getWhatsAppStatus();
          if (status.status === 'connected') {
            setWaStatus('connected');
            setWaConnecting(false);
            return;
          }
        } catch {}

        // Try to connect (create instance)
        try {
          const result = await connectWhatsApp();
          if (result.qr_code) {
            setQrCode(result.qr_code);
          }
        } catch (err) {
          setWaError(err.message || 'Erreur de connexion WhatsApp');
          setWaConnecting(false);
          // Still try to poll QR in case instance already exists
        }

        setWaConnecting(false);

        // Start polling QR as fallback (WebSocket qr_update is preferred)
        const poll = async () => {
          if (cancelled) return;
          try {
            const data = await getWhatsAppQR();
            if (data.status === 'connected') {
              setWaStatus('connected');
              setQrCode('');
              clearInterval(qrIntervalRef.current);
              return;
            }
            if (data.status === 'not_configured') {
              setWaError('Evolution API non configuree. Configurez-la dans les parametres Admin.');
              clearInterval(qrIntervalRef.current);
              return;
            }
            if (data.qr_code) {
              setQrCode(data.qr_code);
              setWaStatus('connecting');
            }
          } catch {}
        };

        poll();
        qrIntervalRef.current = setInterval(poll, 3000);
      };

      initWhatsApp();
      return () => {
        cancelled = true;
        clearInterval(qrIntervalRef.current);
      };
    }
  }, [step, waPath]);

  // Step 3 Path B: Load available instances
  useEffect(() => {
    if (step === 3 && waPath === 'B') {
      setLoadingInstances(true);
      listInstances()
        .then((data) => {
          setAvailableInstances(data.instances || []);
        })
        .catch(() => {
          setAvailableInstances([]);
        })
        .finally(() => setLoadingInstances(false));
    }
  }, [step, waPath]);

  const handleConnectExisting = async () => {
    if (!existingInstanceName.trim()) return;
    setConnectingExisting(true);
    setWaError('');
    try {
      const result = await connectExistingWhatsApp(existingInstanceName.trim());
      setWaStatus(result.status);
      setWebhookUrl(result.webhook_url || '');
      setConnectionChecks(result.checks || null);
      setPathBSuccess(true);
    } catch (err) {
      setWaError(err.message || 'Erreur de connexion');
    } finally {
      setConnectingExisting(false);
    }
  };

  // Step 4: Load groups
  useEffect(() => {
    if (step === 4) {
      getGroups()
        .then(setGroups)
        .catch(() => {});
    }
  }, [step]);

  const handleToggleGroup = async (groupId) => {
    try {
      await toggleGroup(groupId);
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, is_monitored: !g.is_monitored } : g))
      );
    } catch {
      // ignore
    }
  };

  const handleFinish = async () => {
    try {
      await updateProfile({
        keywords,
        anti_keywords: antiKeywords,
        intentions,
        sector,
        phone,
        score_threshold: scoreThreshold,
        alert_template: alertTemplate,
        raw_text: rawText,
      });
    } catch {
      // ignore
    }
    navigate('/dashboard');
  };

  const progress = (step / 4) * 100;

  return (
    <div className="bg-background-light text-slate-900 min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-primary/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-xl">radar</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">RADAR</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">
        {/* Progress */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <span className="mono-label text-xs font-bold text-primary">
              Onboarding — Etape {step} sur 4
            </span>
            <span className="text-sm font-medium text-slate-500">{Math.round(progress)}% complete</span>
          </div>
          <div className="h-2 w-full bg-primary/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div className="space-y-4 mb-10">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Etape 1 — Qui etes-vous ?</h2>
              <p className="text-lg text-slate-600 max-w-2xl">
                Decrivez votre activite pour que Radar puisse analyser votre profil professionnel et identifier vos opportunites.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8 transition-all hover:shadow-md">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-end">
                  <label className="mono-label text-xs font-bold text-slate-500">Description de votre activite</label>
                  <span className="mono-label text-[10px] text-slate-400">{rawText.length} / 2000 caracteres</span>
                </div>
                <textarea
                  className="w-full min-h-[180px] p-4 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 placeholder:text-slate-400 bg-slate-50/50"
                  placeholder="Ex: Je suis consultant en transformation digitale specialise dans l'implementation de solutions CRM pour les PME du secteur industriel..."
                  maxLength={2000}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || !rawText.trim()}
                    className="bg-primary text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    <span>{analyzing ? 'Analyse en cours...' : 'Analyser mon profil'}</span>
                    <span className="material-symbols-outlined text-lg">trending_up</span>
                  </button>
                </div>
              </div>
            </div>

            {analyzed && (
              <div className="space-y-8 animate-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-xl">label</span>
                      <h3 className="font-bold text-slate-800">Mots-cles generes</h3>
                    </div>
                    <KeywordChips keywords={keywords} onChange={setKeywords} />
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-xl">psychology</span>
                      <h3 className="font-bold text-slate-800">Intentions detectees</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {intentions.map((intent, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold mono-label border border-slate-200">
                          {intent}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {sector && (
                  <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-10 bg-primary/20 rounded-lg flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined">domain</span>
                        </div>
                        <div>
                          <p className="mono-label text-[10px] text-primary font-bold">Secteur detecte</p>
                          <p className="text-xl font-extrabold text-slate-900 tracking-tight">{sector}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <div className="space-y-4 mb-10">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Etape 2 — Parametres d'alerte</h2>
              <p className="text-lg text-slate-600 max-w-2xl">Configurez comment vous souhaitez etre alerte des nouvelles opportunites.</p>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <label className="flex flex-col gap-2 mb-6">
                  <span className="mono-label text-xs font-bold text-slate-500">Numero WhatsApp pour alertes</span>
                  <input
                    type="text"
                    className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 bg-slate-50/50 font-mono"
                    placeholder="+33 6 00 00 00 00"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>

                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <span className="mono-label text-xs font-bold text-slate-500">Score minimum de pertinence</span>
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

                <label className="flex flex-col gap-2">
                  <span className="mono-label text-xs font-bold text-slate-500">Modele d'alerte</span>
                  <textarea
                    className="w-full min-h-[120px] p-4 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 placeholder:text-slate-400 bg-slate-50/50 font-mono text-sm"
                    placeholder="Ex: Nouvelle opportunite detectee ! Score: {{score}}% - Groupe: {{groupe}}"
                    value={alertTemplate}
                    onChange={(e) => setAlertTemplate(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <div className="space-y-4 mb-10">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Etape 3 — Connexion WhatsApp</h2>
              <p className="text-lg text-slate-600 max-w-2xl">Connectez votre WhatsApp pour que Radar puisse surveiller vos groupes.</p>
            </div>

            {/* Connected state - shown for both paths */}
            {waStatus === 'connected' ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center">
                <div className="text-center space-y-4">
                  <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-primary text-4xl">check_circle</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {pathBSuccess ? `Instance ${existingInstanceName} connectee a Radar` : 'WhatsApp connecte !'}
                  </h3>
                  <p className="text-slate-500">Votre compte est pret pour la surveillance.</p>
                </div>
              </div>
            ) : !waPath ? (
              /* Path choice */
              <div className="space-y-6">
                <p className="text-base text-slate-600 font-medium">Utilisez-vous deja un outil Jockalia Services avec WhatsApp ?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setWaPath('A')}
                    className="bg-white rounded-xl border-2 border-slate-200 hover:border-primary p-6 text-left transition-all hover:shadow-md group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="size-10 bg-slate-100 group-hover:bg-primary/10 rounded-lg flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-slate-500 group-hover:text-primary">qr_code_2</span>
                      </div>
                      <h3 className="font-bold text-slate-800">Non, je n'ai pas de WhatsApp Jockalia</h3>
                    </div>
                    <p className="text-sm text-slate-500">Creer une nouvelle instance WhatsApp et scanner un QR code pour la connecter.</p>
                  </button>
                  <button
                    onClick={() => setWaPath('B')}
                    className="bg-white rounded-xl border-2 border-slate-200 hover:border-primary p-6 text-left transition-all hover:shadow-md group"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="size-10 bg-slate-100 group-hover:bg-primary/10 rounded-lg flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-slate-500 group-hover:text-primary">link</span>
                      </div>
                      <h3 className="font-bold text-slate-800">Oui, j'utilise deja un outil Jockalia</h3>
                    </div>
                    <p className="text-sm text-slate-500">Connecter une instance Evolution API existante a Radar.</p>
                  </button>
                </div>
              </div>
            ) : waPath === 'A' ? (
              /* Path A: New instance + QR */
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center">
                {waError ? (
                  <div className="text-center space-y-4 py-8">
                    <div className="size-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                      <span className="material-symbols-outlined text-amber-500 text-4xl">warning</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Configuration requise</h3>
                    <p className="text-slate-500 max-w-md">{waError}</p>
                    <button
                      onClick={() => { setWaError(''); setWaPath('A'); }}
                      className="text-primary font-bold text-sm hover:underline"
                    >
                      Reessayer
                    </button>
                    <p className="text-xs text-slate-400 mt-4">
                      Vous pouvez passer cette etape et configurer WhatsApp plus tard dans les parametres.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="size-64 bg-slate-100 rounded-xl flex items-center justify-center mb-6 border border-slate-200">
                      {qrCode ? (
                        typeof qrCode === 'string' && qrCode.startsWith('data:') ? (
                          <img src={qrCode} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                        ) : (
                          <div className="text-center p-4">
                            <span className="material-symbols-outlined text-primary text-5xl mb-2 block">qr_code_2</span>
                            <p className="text-xs text-slate-500 font-mono break-all">{String(qrCode).substring(0, 50)}...</p>
                            <p className="text-sm text-slate-600 mt-2">Scannez avec WhatsApp</p>
                          </div>
                        )
                      ) : waConnecting ? (
                        <div className="text-center text-slate-400">
                          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                          <p className="text-sm">Connexion en cours...</p>
                        </div>
                      ) : (
                        <div className="text-center text-slate-400">
                          <span className="material-symbols-outlined text-5xl mb-2 block">qr_code_2</span>
                          <p className="text-sm">Chargement du QR code...</p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">Scannez ce QR code avec WhatsApp pour connecter votre compte</p>
                  </>
                )}
                <button
                  onClick={() => { setWaPath(null); setQrCode(''); setWaError(''); clearInterval(qrIntervalRef.current); }}
                  className="mt-6 text-slate-400 text-sm hover:text-slate-600 transition-colors"
                >
                  Retour au choix
                </button>
              </div>
            ) : pathBSuccess ? (
              /* Path B: Success state — show real test results + webhook URL */
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
                <div className="text-center space-y-4">
                  <div className="size-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-green-600 text-4xl">verified</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">
                    Instance {existingInstanceName} testee et validee
                  </h3>
                </div>

                {/* Test results */}
                {connectionChecks && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 max-w-lg mx-auto space-y-2">
                    <h4 className="font-bold text-slate-700 text-sm mb-3">Tests de connectivite</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="material-symbols-outlined text-green-500 text-base">check_circle</span>
                      <span className="text-slate-700">Instance trouvee dans Evolution API</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="material-symbols-outlined text-green-500 text-base">check_circle</span>
                      <span className="text-slate-700">WhatsApp connecte (statut: open)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="material-symbols-outlined text-green-500 text-base">check_circle</span>
                      <span className="text-slate-700">{connectionChecks.groups_count} groupe{connectionChecks.groups_count > 1 ? 's' : ''} accessible{connectionChecks.groups_count > 1 ? 's' : ''}</span>
                    </div>
                    {connectionChecks.webhook_already_configured && (
                      <div className="flex items-start gap-2 text-sm mt-2 bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <span className="material-symbols-outlined text-blue-500 text-base shrink-0 mt-0.5">info</span>
                        <span className="text-blue-700">
                          Un webhook est deja configure sur cette instance
                          {connectionChecks.existing_webhook_url && (
                            <span className="block text-xs font-mono text-blue-500 mt-1 break-all">{connectionChecks.existing_webhook_url}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Webhook URL — prominent amber box */}
                <div className="bg-amber-50 rounded-xl border-2 border-amber-300 p-6 space-y-4 max-w-lg mx-auto">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-xl">link</span>
                    <h4 className="font-bold text-amber-800 text-base">URL webhook Radar a configurer</h4>
                  </div>
                  <p className="text-sm text-amber-700">
                    Transmettez cette URL a votre administrateur pour qu'il la configure dans Evolution API sur l'instance <strong>{existingInstanceName}</strong>.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white rounded-lg border-2 border-amber-200 px-4 py-3 text-sm font-mono text-slate-800 break-all select-all">
                      {webhookUrl}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        setWebhookUrlCopied(true);
                        setTimeout(() => setWebhookUrlCopied(false), 3000);
                      }}
                      className={`shrink-0 px-4 py-3 rounded-lg font-bold text-sm flex items-center gap-1 transition-all ${
                        webhookUrlCopied
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-amber-200 text-amber-800 hover:bg-amber-300 border border-amber-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{webhookUrlCopied ? 'done' : 'content_copy'}</span>
                      {webhookUrlCopied ? 'Copie !' : 'Copier'}
                    </button>
                  </div>
                  {connectionChecks?.webhook_already_configured && (
                    <p className="text-xs text-amber-600 font-medium">
                      Attention : un webhook existe deja sur cette instance. L'administrateur devra le remplacer ou configurer un relais multi-webhook.
                    </p>
                  )}
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setStep(4)}
                    className="bg-primary text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <span>J'ai transmis l'URL, continuer</span>
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Path B: Existing instance selection */
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
                <div>
                  <label className="mono-label text-xs font-bold text-slate-500 block mb-2">
                    Nom de votre instance Evolution API
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 bg-slate-50/50 font-mono"
                    placeholder="ex: mon-instance-whatsapp"
                    value={existingInstanceName}
                    onChange={(e) => setExistingInstanceName(e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    Vous trouverez le nom de votre instance dans les parametres de votre autre application Jockalia Services.
                  </p>
                </div>

                {/* Available instances list */}
                <div>
                  <h4 className="mono-label text-xs font-bold text-slate-500 mb-3">Instances disponibles</h4>
                  {loadingInstances ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                      <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      Chargement des instances...
                    </div>
                  ) : availableInstances.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4">Aucune instance trouvee.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {availableInstances.map((inst) => (
                        <button
                          key={inst.instance_name}
                          onClick={() => setExistingInstanceName(inst.instance_name)}
                          className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                            existingInstanceName === inst.instance_name
                              ? 'border-primary bg-primary/5'
                              : 'border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-mono text-sm text-slate-700">{inst.instance_name}</span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            inst.status === 'open'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {inst.status === 'open' ? 'Connecte' : inst.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {waError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {waError}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => { setWaPath(null); setWaError(''); setExistingInstanceName(''); }}
                    className="text-slate-400 text-sm hover:text-slate-600 transition-colors"
                  >
                    Retour au choix
                  </button>
                  <button
                    onClick={handleConnectExisting}
                    disabled={!existingInstanceName.trim() || connectingExisting}
                    className="bg-primary text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {connectingExisting ? (
                      <>
                        <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Connexion...
                      </>
                    ) : (
                      <>
                        <span>Connecter cette instance</span>
                        <span className="material-symbols-outlined text-lg">link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <>
            <div className="space-y-4 mb-10">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Etape 4 — Selection des groupes</h2>
              <p className="text-lg text-slate-600 max-w-2xl">Choisissez les groupes WhatsApp que Radar doit surveiller.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              {groups.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Aucun groupe detecte. Assurez-vous que WhatsApp est connecte.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={group.is_monitored}
                        onChange={() => handleToggleGroup(group.id)}
                        className="rounded text-primary focus:ring-primary h-5 w-5 mr-3"
                      />
                      <span className="flex-1 font-medium text-slate-800">{group.name}</span>
                      <span className="text-xs mono-text bg-slate-100 px-2 py-1 rounded">
                        {group.member_count || 0} membres
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Navigation */}
        <div className="mt-16 pt-8 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => step > 1 && setStep(step - 1)}
            className={`px-6 py-2 rounded-lg text-slate-500 font-semibold hover:bg-slate-100 transition-colors flex items-center gap-2 ${step === 1 ? 'invisible' : ''}`}
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            <span>Precedent</span>
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-10 py-3 rounded-lg bg-primary text-white font-bold hover:shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2"
            >
              <span>Continuer</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-10 py-3 rounded-lg bg-primary text-white font-bold hover:shadow-lg hover:shadow-primary/30 transition-all flex items-center gap-2"
            >
              <span>Terminer</span>
              <span className="material-symbols-outlined text-lg">check</span>
            </button>
          )}
        </div>
      </main>

      <footer className="py-10 text-center text-slate-400 text-sm">
        <p>&copy; 2024 RADAR AI. Tous droits reserves.</p>
      </footer>
    </div>
  );
}
