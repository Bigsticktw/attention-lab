import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Brain, Check, ChevronRight, Cloud, CloudOff, QrCode, RotateCcw, Settings, Timer, Volume2, VolumeX, Wind } from 'lucide-react'
import QRCode from 'react-qr-code'
import { fetchDashboard, flushQueue, queueOrSend } from './api'
import { normalizeTrainingDuration, summarizeSession } from './adaptive'
import { playRoundCompleteSound, prepareRoundCompleteSound } from './audio'
import { createPairingPayload, loadConfig, loadLocalHistory, loadQueue, loadSoundEnabled, loadTrainingDuration, localDailyMetrics, parsePairingHash, saveConfig, saveLocalSession, saveSoundEnabled, saveTrainingDuration } from './storage'
import type { ApiConfig, DailyMetric, RoundRecord, RoundResult, SessionRecord } from './types'

type View = 'dashboard' | 'training' | 'settings'
type TrainingPhase = 'idle' | 'running' | 'feedback' | 'summary'

const formatSeconds = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const today = () => new Date().toLocaleDateString('sv-SE')
const pairedConfig = typeof window === 'undefined' ? null : parsePairingHash(window.location.hash)

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [config, setConfig] = useState<ApiConfig>(() => pairedConfig || loadConfig())
  const [metrics, setMetrics] = useState<DailyMetric[]>(localDailyMetrics)
  const [queueCount, setQueueCount] = useState(loadQueue().length)
  const [syncing, setSyncing] = useState(false)
  const [phase, setPhase] = useState<TrainingPhase>('idle')
  const [target, setTarget] = useState(() => normalizeTrainingDuration(loadTrainingDuration()))
  const [remaining, setRemaining] = useState(target)
  const [lapseLevel, setLapseLevel] = useState(2)
  const [summary, setSummary] = useState<SessionRecord | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled)
  const sessionId = useRef('')
  const roundStartedAt = useRef(0)
  const actionLocked = useRef(false)

  const latest = metrics.at(-1)
  const connected = Boolean(config.endpoint && config.token)
  const todayMinutes = metrics.filter((item) => item.date === today()).reduce((sum, item) => sum + Number(item.training_minutes || 0), 0)
  const dailyGoalMet = metrics.some((item) => item.date === today() && Number(item.training_minutes) > 0)
    || loadLocalHistory().some((item) => item.date === today() && item.rounds > 0)

  const refresh = useCallback(async () => {
    if (!config.endpoint || !config.token) return
    setSyncing(true)
    const sent = await flushQueue(config)
    const remote = await fetchDashboard(config)
    if (remote.length) setMetrics(remote)
    setQueueCount(loadQueue().length)
    setSyncing(false)
    return sent
  }, [config])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!pairedConfig) return
    saveConfig(pairedConfig)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [])

  useEffect(() => {
    if (phase !== 'running') return
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartedAt.current) / 1000)
      const next = Math.max(0, target - elapsed)
      setRemaining(next)
      if (next === 0) {
        window.clearInterval(interval)
        if (soundEnabled) void playRoundCompleteSound()
        navigator.vibrate?.([80, 60, 80])
        setPhase('feedback')
      }
    }, 200)
    return () => window.clearInterval(interval)
  }, [phase, soundEnabled, target])

  const beginRound = () => {
    if (soundEnabled) void prepareRoundCompleteSound()
    sessionId.current = crypto.randomUUID()
    setSummary(null)
    roundStartedAt.current = Date.now()
    setRemaining(target)
    setPhase('running')
  }

  const reportResult = (result: RoundResult) => {
    if (actionLocked.current) return
    actionLocked.current = true
    const record: RoundRecord = {
      timestamp: new Date().toISOString(),
      session_id: sessionId.current,
      round: 1,
      target_duration: target,
      actual_duration: target,
      result,
      lapse_level: result === 'Success' ? 0 : lapseLevel,
      next_duration: target,
      session_elapsed: target,
    }
    const sessionRecord = summarizeSession(sessionId.current, [record])
    saveLocalSession(sessionRecord)
    setSummary(sessionRecord)
    setMetrics(localDailyMetrics())
    const roundSync = queueOrSend(config, 'round', record)
    const sessionSync = queueOrSend(config, 'session', sessionRecord)
    setQueueCount(loadQueue().length)
    setPhase('summary')
    window.setTimeout(() => { actionLocked.current = false }, 0)
    void Promise.allSettled([roundSync, sessionSync]).finally(() => {
      setQueueCount(loadQueue().length)
      void refresh()
    })
  }

  const resetTraining = () => {
    sessionId.current = ''
    setSummary(null)
    setRemaining(target)
    setPhase('idle')
    actionLocked.current = false
  }

  const updateDuration = (seconds: number) => {
    const next = normalizeTrainingDuration(seconds)
    setTarget(next)
    setRemaining(next)
    saveTrainingDuration(next)
  }

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    saveSoundEnabled(next)
    if (next) void prepareRoundCompleteSound()
  }

  const chartData = useMemo(() => metrics.slice(-7).map((item) => ({ ...item, label: item.date.slice(5) })), [metrics])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('dashboard')} aria-label="回到首頁">
          <span className="brand-mark"><Brain size={22} /></span>
          <span><strong>Attention Lab</strong><small>Fixed-duration Focus Training</small></span>
        </button>
        <button className={`sync-pill ${!connected ? 'disconnected' : queueCount ? 'pending' : ''}`} onClick={() => connected ? void refresh() : setView('settings')} disabled={syncing} aria-label={!connected ? '尚未連線，開啟設定' : '同步 Google Sheets'}>
          {!connected || queueCount ? <CloudOff size={15} /> : <Cloud size={15} />}
          <span className="sync-label">{syncing ? '同步中' : !connected ? '未連線' : queueCount ? `${queueCount} 筆待同步` : '已同步'}</span>
        </button>
      </header>

      <main>
        {view === 'dashboard' && (
          <section className="dashboard page-enter">
            <div className="hero-copy">
              <p className="eyebrow">TODAY · {today()}</p>
              <h1>一次設定，<br /><em>專注到底。</em></h1>
              <p>預設五分鐘，也可以依今天的狀態自行調整。</p>
            </div>

            <div className={`daily-gate ${dailyGoalMet ? 'done' : ''}`}>
              <span className="gate-icon">{dailyGoalMet ? <Check /> : <Wind />}</span>
              <span><small>今日最低完成條件</small><strong>{dailyGoalMet ? '已完成一次專注訓練' : '完成一次專注訓練'}</strong></span>
            </div>

            <div className="metrics-grid">
              <article className="metric primary"><span className="metric-label"><Timer size={17} /> 今日訓練</span><strong>{todayMinutes.toFixed(1)}<small>分鐘</small></strong><span>完成一段由你決定的專注時間</span></article>
              <article className="metric"><span className="metric-label"><Activity size={17} /> 本次設定</span><strong>{target / 60}<small>分鐘</small></strong><span>預設 5 分鐘，可自行調整</span></article>
              <article className="metric"><span className="metric-label"><Check size={17} /> 最近自評</span><strong>{Math.round((latest?.success_rate || 0) * 100)}<small>%</small></strong><span>只記錄回報，不調整下次時長</span></article>
            </div>

            <article className="trend-card">
              <div><p className="eyebrow">7-DAY TRAINING</p><h2>每日訓練分鐘</h2></div>
              <div className="chart-wrap">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 15, right: 8, left: -24, bottom: 0 }}>
                      <defs><linearGradient id="attentionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9fe6c3" stopOpacity={0.45}/><stop offset="100%" stopColor="#9fe6c3" stopOpacity={0}/></linearGradient></defs>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#82918b', fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#82918b', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: '#151d1a', border: '1px solid #2c3833', borderRadius: 12 }} />
                      <Area type="monotone" dataKey="training_minutes" stroke="#9fe6c3" strokeWidth={3} fill="url(#attentionFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="empty-chart">完成第一次訓練後，紀錄會從這裡開始。</div>}
              </div>
            </article>

            <button className="start-cta" onClick={() => { setView('training'); resetTraining() }}>
              <span><small>Today's Training</small><strong>開始專注訓練</strong></span><ChevronRight />
            </button>
          </section>
        )}

        {view === 'training' && (
          <section className="training page-enter">
            <div className="training-header"><button className="text-button" onClick={() => setView('dashboard')} disabled={phase === 'running' || phase === 'feedback'}>← 返回</button><span>單次訓練</span><button className="sound-toggle" onClick={toggleSound} aria-pressed={soundEnabled} aria-label={soundEnabled ? '關閉結束提示音' : '開啟結束提示音'}>{soundEnabled ? <Volume2 /> : <VolumeX />}<span>{soundEnabled ? '提示音開' : '提示音關'}</span></button></div>
            {phase === 'running' && (
              <div className="timer-stage">
                <p className="eyebrow">FOLLOW THE BREATH</p>
                <div className="breath-orbit"><div className="breath-core"><strong>{formatSeconds(remaining)}</strong><span>專注呼吸</span></div></div>
                <p className="timer-hint">感覺呼吸，不必控制呼吸。</p>
                <p className="timer-alert">{soundEnabled ? '結束時會播放提示音並震動' : '提示音已關閉，結束時仍會震動'}</p>
              </div>
            )}
            {phase === 'feedback' && (
              <div className="feedback-stage">
                <p className="eyebrow">SESSION COMPLETE</p><h2>剛才是否明顯走神？</h2><p>這項回報只用來留下紀錄，不會改變下次時長。</p>
                <div className="feedback-actions"><button className="success-action" onClick={() => reportResult('Success')}><Check />穩定專注</button><button className="lapse-action" onClick={() => reportResult('Lapse')}><RotateCcw />有走神</button></div>
                <label className="severity">若有走神，程度 <strong>{lapseLevel}</strong><input type="range" min="1" max="3" value={lapseLevel} onChange={(event) => setLapseLevel(Number(event.target.value))}/><span><small>立即察覺</small><small>很久才察覺</small></span></label>
              </div>
            )}
            {phase === 'idle' && (
              <div className="ready-stage">
                <p className="eyebrow">SESSION DURATION</p><h2>{formatSeconds(target)}</h2><p>一次倒數完成，不會依表現自動增減。</p>
                <div className="duration-presets" aria-label="快速選擇訓練時長">{[3, 5, 10, 15].map((minutes) => <button key={minutes} className={target === minutes * 60 ? 'active' : ''} onClick={() => updateDuration(minutes * 60)}>{minutes} 分</button>)}</div>
                <label className="duration-picker"><span>自訂時長</span><input type="number" min="1" max="60" step="1" value={target / 60} onChange={(event) => updateDuration(Number(event.target.value) * 60)} /><small>分鐘（1–60）</small></label>
                <button className="round-start" onClick={beginRound}><Wind />開始 {target / 60} 分鐘訓練</button>
              </div>
            )}
            {phase === 'summary' && summary && (
              <div className="summary-stage"><span className="summary-check"><Check /></span><p className="eyebrow">SESSION SAVED</p><h2>本次專注訓練已完成。</h2><div className="summary-grid"><span><small>訓練時長</small><strong>{formatSeconds(summary.threshold)}</strong></span><span><small>自評</small><strong>{summary.success_rate > 0 ? '穩定' : '走神'}</strong></span><span><small>紀錄</small><strong>已儲存</strong></span></div><button className="round-start" onClick={() => setView('dashboard')}>查看儀表板</button></div>
            )}
          </section>
        )}

        {view === 'settings' && (
          <SettingsPanel config={config} onSave={(next) => { saveConfig(next); setConfig(next); setView('dashboard') }} />
        )}
      </main>

      {view !== 'training' && <nav className="bottom-nav"><button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><Activity />總覽</button><button onClick={() => { setView('training'); resetTraining() }}><Wind />訓練</button><button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings />設定</button></nav>}
    </div>
  )
}

function SettingsPanel({ config, onSave }: { config: ApiConfig; onSave: (config: ApiConfig) => void }) {
  const [draft, setDraft] = useState(config)
  const [showPairing, setShowPairing] = useState(false)
  const pairingUrl = draft.endpoint && draft.token ? `${window.location.origin}${import.meta.env.BASE_URL}#setup=${createPairingPayload(draft)}` : ''
  return <section className="settings-page page-enter"><p className="eyebrow">PRIVATE CONNECTION</p><h1>Google Sheets 連線</h1><p>資料只會傳到你自己的 Apps Script。設定保存在此瀏覽器，不會提交到 GitHub；每支手機第一次使用都要配對一次。</p><label>Web App URL<input value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value.trim() })} placeholder="https://script.google.com/macros/s/.../exec" /></label><label>API Token<input type="password" value={draft.token} onChange={(event) => setDraft({ ...draft, token: event.target.value })} placeholder="你的私人 Token" /></label><button className="round-start" onClick={() => onSave(draft)} disabled={!draft.endpoint || !draft.token}>儲存連線設定</button><button className="pairing-button" onClick={() => setShowPairing((current) => !current)} disabled={!pairingUrl}><QrCode />{showPairing ? '隱藏手機配對碼' : '顯示手機配對 QR Code'}</button>{showPairing && pairingUrl && <div className="pairing-card"><div className="qr-frame"><QRCode value={pairingUrl} size={196} /></div><strong>用自己的手機相機掃描</strong><p>開啟後會自動保存連線並清除網址中的配對資料。QR 內含私人 Token，請勿截圖或分享。</p></div>}<div className="privacy-note"><Cloud size={18}/><span><strong>公開前端，私人資料</strong><small>Spreadsheet ID 與 Token 不會包含在 GitHub 原始碼。</small></span></div></section>
}

export default App
