import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Brain, Check, ChevronRight, Cloud, CloudOff, QrCode, RotateCcw, Settings, Timer, Volume2, VolumeX, Wind } from 'lucide-react'
import QRCode from 'react-qr-code'
import { fetchDashboard, flushQueue, queueOrSend } from './api'
import { nextInterval, summarizeSession, warmupInterval } from './adaptive'
import { playRoundCompleteSound, prepareRoundCompleteSound } from './audio'
import { createPairingPayload, loadConfig, loadLocalHistory, loadQueue, loadSoundEnabled, localDailyMetrics, parsePairingHash, saveConfig, saveLocalSession, saveSoundEnabled } from './storage'
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
  const [rounds, setRounds] = useState<RoundRecord[]>([])
  const [target, setTarget] = useState(() => warmupInterval(loadLocalHistory().at(-1)?.threshold))
  const [remaining, setRemaining] = useState(target)
  const [lapseLevel, setLapseLevel] = useState(2)
  const [summary, setSummary] = useState<SessionRecord | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled)
  const sessionId = useRef('')
  const sessionStartedAt = useRef(0)
  const roundStartedAt = useRef(0)
  const actionLocked = useRef(false)

  const latest = metrics.at(-1)
  const connected = Boolean(config.endpoint && config.token)
  const previous = metrics.at(-2)
  const thresholdChange = latest && previous && previous.threshold ? ((latest.threshold - previous.threshold) / previous.threshold) * 100 : 0
  const todayMinutes = metrics.filter((item) => item.date === today()).reduce((sum, item) => sum + Number(item.training_minutes || 0), 0)
  const dailyGoalMet = rounds.some((round) => round.result === 'Success') || loadLocalHistory().some((item) => item.date === today() && item.success_rate > 0)

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
    if (!sessionId.current) {
      sessionId.current = crypto.randomUUID()
      sessionStartedAt.current = Date.now()
      setRounds([])
    }
    roundStartedAt.current = Date.now()
    setRemaining(target)
    setPhase('running')
  }

  const reportResult = (result: RoundResult) => {
    if (actionLocked.current) return
    actionLocked.current = true
    const pairResults = [...rounds.map((round) => round.result), result]
    const next = nextInterval(target, pairResults)
    const record: RoundRecord = {
      timestamp: new Date().toISOString(),
      session_id: sessionId.current,
      round: rounds.length + 1,
      target_duration: target,
      actual_duration: Math.round((Date.now() - roundStartedAt.current) / 1000),
      result,
      lapse_level: result === 'Success' ? 0 : lapseLevel,
      next_duration: next,
      session_elapsed: Math.round((Date.now() - sessionStartedAt.current) / 1000),
    }
    setRounds((current) => [...current, record])
    setTarget(next)
    setRemaining(next)
    const sync = queueOrSend(config, 'round', record)
    setQueueCount(loadQueue().length)
    setPhase('idle')
    window.setTimeout(() => { actionLocked.current = false }, 0)
    void sync.finally(() => setQueueCount(loadQueue().length))
  }

  const finishSession = () => {
    if (!rounds.length || actionLocked.current) return
    actionLocked.current = true
    const record = summarizeSession(sessionId.current, rounds, sessionStartedAt.current)
    saveLocalSession(record)
    setSummary(record)
    setMetrics(localDailyMetrics())
    const sync = queueOrSend(config, 'session', record)
    setQueueCount(loadQueue().length)
    setPhase('summary')
    window.setTimeout(() => { actionLocked.current = false }, 0)
    void sync.finally(() => {
      setQueueCount(loadQueue().length)
      void refresh()
    })
  }

  const resetTraining = () => {
    sessionId.current = ''
    sessionStartedAt.current = 0
    setRounds([])
    setSummary(null)
    setTarget(warmupInterval(metrics.at(-1)?.threshold))
    setPhase('idle')
    actionLocked.current = false
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
          <span><strong>Attention Lab</strong><small>Closed-loop Focus Training</small></span>
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
              <h1>讓注意力回到<br /><em>可以訓練的尺度。</em></h1>
              <p>不是追求撐得更久，而是找到今天剛好的能力邊界。</p>
            </div>

            <div className={`daily-gate ${dailyGoalMet ? 'done' : ''}`}>
              <span className="gate-icon">{dailyGoalMet ? <Check /> : <Wind />}</span>
              <span><small>今日最低完成條件</small><strong>{dailyGoalMet ? '已完成一次穩定專注' : '完成一次穩定專注為止'}</strong></span>
            </div>

            <div className="metrics-grid">
              <article className="metric primary">
                <span className="metric-label"><Activity size={17} /> Attention Threshold</span>
                <strong>{Math.round(latest?.threshold || 20)}<small>秒</small></strong>
                <span className={thresholdChange >= 0 ? 'positive' : 'negative'}>{thresholdChange >= 0 ? '↑' : '↓'} {Math.abs(thresholdChange).toFixed(1)}% vs. 上次</span>
              </article>
              <article className="metric"><span className="metric-label"><Timer size={17} /> 今日訓練</span><strong>{todayMinutes.toFixed(1)}<small>分鐘</small></strong><span>建議 10–15 分鐘</span></article>
              <article className="metric"><span className="metric-label"><Check size={17} /> 成功率</span><strong>{Math.round((latest?.success_rate || 0) * 100)}<small>%</small></strong><span>目標邊界約 70%</span></article>
            </div>

            <article className="trend-card">
              <div><p className="eyebrow">7-DAY SIGNAL</p><h2>專注閾值趨勢</h2></div>
              <div className="chart-wrap">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 15, right: 8, left: -24, bottom: 0 }}>
                      <defs><linearGradient id="attentionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9fe6c3" stopOpacity={0.45}/><stop offset="100%" stopColor="#9fe6c3" stopOpacity={0}/></linearGradient></defs>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#82918b', fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#82918b', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: '#151d1a', border: '1px solid #2c3833', borderRadius: 12 }} />
                      <Area type="monotone" dataKey="threshold" stroke="#9fe6c3" strokeWidth={3} fill="url(#attentionFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="empty-chart">完成第一輪訓練後，趨勢會從這裡開始。</div>}
              </div>
            </article>

            <button className="start-cta" onClick={() => { setView('training'); resetTraining() }}>
              <span><small>Today's Training</small><strong>開始閉環訓練</strong></span><ChevronRight />
            </button>
          </section>
        )}

        {view === 'training' && (
          <section className="training page-enter">
            <div className="training-header"><button className="text-button" onClick={() => setView('dashboard')}>← 返回</button><span>第 {rounds.length + 1} 輪</span><button className="sound-toggle" onClick={toggleSound} aria-pressed={soundEnabled} aria-label={soundEnabled ? '關閉結束提示音' : '開啟結束提示音'}>{soundEnabled ? <Volume2 /> : <VolumeX />}<span>{soundEnabled ? '提示音開' : '提示音關'}</span></button></div>
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
                <p className="eyebrow">ROUND {rounds.length + 1} COMPLETE</p><h2>剛才是否明顯走神？</h2><p>誠實回報比「答對」更重要。</p>
                <div className="feedback-actions"><button className="success-action" onClick={() => reportResult('Success')}><Check />穩定專注</button><button className="lapse-action" onClick={() => reportResult('Lapse')}><RotateCcw />有走神</button></div>
                <label className="severity">若有走神，程度 <strong>{lapseLevel}</strong><input type="range" min="1" max="3" value={lapseLevel} onChange={(event) => setLapseLevel(Number(event.target.value))}/><span><small>立即察覺</small><small>很久才察覺</small></span></label>
              </div>
            )}
            {phase === 'idle' && (
              <div className="ready-stage">
                <p className="eyebrow">ADAPTIVE INTERVAL</p><h2>{target}<small> 秒</small></h2><p>{rounds.length ? `已完成 ${rounds.length} 輪 · ${rounds.filter((round) => round.result === 'Success').length} 次穩定專注` : '今天從前次閾值的 80% 暖身開始。'}</p>
                <button className="round-start" onClick={beginRound}><Wind />{rounds.length ? '開始下一輪' : '開始第一輪'}</button>
                {rounds.length > 0 && <button className="finish-button" onClick={finishSession}>結束並儲存本次訓練</button>}
              </div>
            )}
            {phase === 'summary' && summary && (
              <div className="summary-stage"><span className="summary-check"><Check /></span><p className="eyebrow">SESSION SAVED</p><h2>{summary.success_rate > 0 ? '今天的閉環已建立。' : '資料已保存，明天繼續。'}</h2><div className="summary-grid"><span><small>輪數</small><strong>{summary.rounds}</strong></span><span><small>成功率</small><strong>{Math.round(summary.success_rate * 100)}%</strong></span><span><small>閾值</small><strong>{Math.round(summary.threshold)}s</strong></span></div><button className="round-start" onClick={() => setView('dashboard')}>查看儀表板</button></div>
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
