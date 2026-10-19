const TIME_ZONE = 'America/Los_Angeles'
const DAY_MS = 86_400_000
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const SOURCES = {
  search: '곡 검색', video_lookup: '곡 정보 조회', account_link: '계정 연결',
  playlist_list: '재생목록 조회', playlist_sync: '재생목록 동기화',
}
const METHODS = new Set(['search', 'videos', 'channels', 'playlists', 'playlistItems'])

function pacificDay(time) {
  const parts = Object.fromEntries(dateParts.formatToParts(time).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function shiftDay(day, offset) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10)
}

function pacificMidnight(day) {
  const target = Date.parse(`${day}T00:00:00Z`)
  let time = target
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(dateParts.formatToParts(time).map(part => [part.type, part.value]))
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
    time += target - local
  }
  return time
}

function dailyLimit(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function createYouTubeUsage(db, { now = Date.now, searchDailyLimit, dataDailyLimit } = {}) {
  db.prepare('INSERT OR IGNORE INTO youtube_usage_state (id, started_at) VALUES (1, ?)').run(now())
  const increment = db.prepare(`INSERT INTO youtube_api_usage (day, source, method, requests, last_requested_at)
    VALUES (?, ?, ?, 1, ?) ON CONFLICT(day, source, method) DO UPDATE SET
    requests = requests + 1, last_requested_at = excluded.last_requested_at`)
  const finish = db.prepare(`UPDATE youtube_api_usage SET successes = successes + ?, http_errors = http_errors + ?,
    network_errors = network_errors + ?, quota_errors = quota_errors + ?,
    last_quota_error_at = CASE WHEN ? IS NOT NULL THEN ? ELSE last_quota_error_at END
    WHERE day = ? AND source = ? AND method = ?`)
  let warned = false
  function write(action) {
    try { action(); return true } catch {
      if (!warned) { console.error('YouTube usage collection failed.'); warned = true }
      return false
    }
  }

  async function trackFetch(fetchImpl, source, method, url, init) {
    if (!SOURCES[source] || !METHODS.has(method)) throw new Error('Unknown YouTube usage category')
    const time = now()
    const day = pacificDay(time)
    const recorded = write(() => increment.run(day, source, method, time))
    let response
    try { response = await fetchImpl(url, init) } catch (error) {
      if (recorded) write(() => finish.run(0, 0, 1, 0, null, null, day, source, method))
      throw error
    }
    let quotaError = false
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}))
      quotaError = (Array.isArray(body?.error?.errors) ? body.error.errors : []).some(error =>
        ['quotaExceeded', 'dailyLimitExceeded', 'dailyLimitExceededUnreg', 'rateLimitExceeded', 'userRateLimitExceeded'].includes(error?.reason))
    }
    const errorTime = quotaError ? now() : null
    if (recorded) write(() => finish.run(Number(response.ok), Number(!response.ok), 0, Number(quotaError), errorTime, errorTime, day, source, method))
    return response
  }

  function snapshot() {
    const time = now()
    const day = pacificDay(time)
    const startedAt = db.prepare('SELECT started_at FROM youtube_usage_state WHERE id = 1').get().started_at
    const rows = db.prepare('SELECT * FROM youtube_api_usage WHERE day >= ? AND day <= ?').all(shiftDay(day, -6), day)
    const sum = (selected) => selected.reduce((totals, row) => {
      totals.requests += row.requests
      totals.searchUnits += row.method === 'search' ? row.requests : 0
      totals.dataUnits += row.method === 'search' ? 0 : row.requests
      totals.errors += row.http_errors + row.network_errors
      totals.uncertain += row.requests - row.successes - row.http_errors
      totals.quotaErrors += row.quota_errors
      totals.lastQuotaErrorAt = Math.max(totals.lastQuotaErrorAt ?? 0, row.last_quota_error_at ?? 0) || null
      return totals
    }, { requests: 0, searchUnits: 0, dataUnits: 0, errors: 0, uncertain: 0, quotaErrors: 0, lastQuotaErrorAt: null })
    const today = rows.filter(row => row.day === day)
    const totals = sum(today)
    const bucket = (used, limit) => ({ used, limit, remaining: Math.max(0, limit - used), percent: used / limit * 100 })
    return {
      estimated: true, timeZone: TIME_ZONE, day, startedAt, generatedAt: time,
      resetsAt: pacificMidnight(shiftDay(day, 1)),
      buckets: {
        search: bucket(totals.searchUnits, dailyLimit(searchDailyLimit, 100)),
        data: bucket(totals.dataUnits, dailyLimit(dataDailyLimit, 10_000)),
      },
      totals,
      daily: Array.from({ length: 7 }, (_, index) => {
        const date = shiftDay(day, index - 6)
        return { day: date, collecting: date >= pacificDay(startedAt), ...sum(rows.filter(row => row.day === date)) }
      }),
      features: Object.entries(SOURCES).map(([source, label]) => ({ source, label, ...sum(today.filter(row => row.source === source)) })),
    }
  }

  function cleanup() {
    write(() => db.prepare('DELETE FROM youtube_api_usage WHERE day < ?').run(shiftDay(pacificDay(now()), -89)))
  }
  return { trackFetch, snapshot, cleanup }
}

module.exports = { createYouTubeUsage, pacificDay, pacificMidnight }
