const RELEASES_URL = 'https://api.github.com/repos/whitekw/jukebox/releases?per_page=30'

function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null
  const parts = value.split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  if (!a || !b) return null
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

function findUpdate(releases, currentVersion) {
  let update = null
  if (!Array.isArray(releases) || !versionParts(currentVersion)) return null
  for (const release of releases) {
    if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) continue
    for (const asset of release.assets) {
      const match = /^B-SIDE-(\d+\.\d+\.\d+)-Setup-x64\.exe$/.exec(asset?.name ?? '')
      if (!match || asset.state !== 'uploaded' || compareVersions(match[1], currentVersion) !== 1) continue
      if (update && compareVersions(match[1], update.version) !== 1) continue
      try {
        const url = new URL(asset.browser_download_url)
        const expectedPath = `/whitekw/jukebox/releases/download/${encodeURIComponent(release.tag_name)}/${asset.name}`
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password
          || url.search || url.hash || url.pathname !== expectedPath) continue
        update = { version: match[1], downloadUrl: url.href }
      } catch { /* Ignore malformed release assets. */ }
    }
  }
  return update
}

function createUpdateChecker({ currentVersion, fetchImpl = fetch, onChange = () => {}, now = Date.now }) {
  let latest = null
  let inFlight = null
  let lastChecked = -Infinity
  const getState = () => ({ currentVersion, availableVersion: latest?.version ?? null })
  function check() {
    if (inFlight) return inFlight
    if (now() - lastChecked < 30 * 60_000) return Promise.resolve(getState())
    lastChecked = now()
    inFlight = (async () => {
      try {
        const response = await fetchImpl(RELEASES_URL, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': `B-SIDE/${currentVersion}` },
          signal: AbortSignal.timeout(10_000), redirect: 'error',
        })
        if (!response.ok) return getState()
        const next = findUpdate(await response.json(), currentVersion)
        // A temporary error or an incomplete release must not hide a known update.
        if (next && (!latest || compareVersions(next.version, latest.version) === 1)) {
          latest = next
          onChange(getState())
        }
      } catch { /* Offline/rate-limited checks should never interrupt playback. */ }
      return getState()
    })().finally(() => { inFlight = null })
    return inFlight
  }
  return { getState, check, getDownloadUrl: () => latest?.downloadUrl ?? null }
}

module.exports = { compareVersions, findUpdate, createUpdateChecker }
