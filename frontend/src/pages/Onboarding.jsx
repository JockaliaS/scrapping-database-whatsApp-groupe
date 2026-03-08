import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateKeywords, updateProfile, connectWhatsApp, getWhatsAppQR, getWhatsAppStatus, getGroups, toggleGroup } from '../services/api';
import KeywordChips from '../components/KeywordChips';

const STEPS = [
  { num: 1, title: 'Qui etes-vous ?' },
  { num: 2, title: 'Alertes' },
  { num: 3, title: 'WhatsApp' },
  { num: 4, title: 'Groupes' },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

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
  const [qrCode, setQrCode] = useState('');
  const [waStatus, setWaStatus] = useState('disconnected');
  const qrIntervalRef = useRef(null);

  // Step 4
  const [groups, setGroups] = useState([]);

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

  // Step 3: Connect + Poll QR
  useEffect(() => {
    if (step === 3) {
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

        // Start polling QR
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
  }, [step]);

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
              <p className="text-lg text-slate-600 max-w-2xl">Scannez le QR code avec votre application WhatsApp pour connecter votre compte.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center">
              {waStatus === 'connected' ? (
                <div className="text-center space-y-4">
                  <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-primary text-4xl">check_circle</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">WhatsApp connecte !</h3>
                  <p className="text-slate-500">Votre compte est pret pour la surveillance.</p>
                </div>
              ) : waError ? (
                <div className="text-center space-y-4 py-8">
                  <div className="size-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-amber-500 text-4xl">warning</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Configuration requise</h3>
                  <p className="text-slate-500 max-w-md">{waError}</p>
                  <button
                    onClick={() => { setWaError(''); setStep(3); }}
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
            </div>
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
