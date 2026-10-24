// Entries are written inside the same transaction as the successful mutation.
function recordRoomManagement(db, room, actor, action, changes, createdAt, target = null) {
  db.prepare(`INSERT INTO room_management_entries
    (room_id, actor_user_id, actor_name, actor_role, target_user_id, target_name, action, changes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(room.id, actor.userId, actor.name, actor.role, target?.userId ?? null,
      target?.name ?? null, action, JSON.stringify(changes), createdAt)
}

function settingsChanges(db, before, after) {
  const changes = []
  for (const [column, field, convert] of [
    ['title', 'title', String], ['allow_guests', 'allowGuests', Boolean],
    ['history_autoplay', 'historyAutoplay', Boolean], ['autoplay_mode', 'autoplayMode', String],
    ['host_volume', 'hostVolume', Number],
    ['autoplay_min_duration_seconds', 'minDurationSeconds', Number],
    ['autoplay_max_duration_seconds', 'maxDurationSeconds', Number],
  ]) {
    if (before[column] !== after[column]) {
      changes.push({ field, before: convert(before[column]), after: convert(after[column]) })
    }
  }
  const normalizeWord = (word) => word.normalize('NFKC').toLocaleLowerCase()
  for (const [column, field, normalize] of [
    ['autoplay_excluded_words', 'excludedWords', normalizeWord],
    ['autoplay_excluded_video_ids', 'excludedVideos', (id) => id],
  ]) {
    const oldValues = JSON.parse(before[column])
    const newValues = JSON.parse(after[column])
    const oldSet = new Set(oldValues.map(normalize))
    const newSet = new Set(newValues.map(normalize))
    let added = newValues.filter((value) => !oldSet.has(normalize(value)))
    let removed = oldValues.filter((value) => !newSet.has(normalize(value)))
    if (!added.length && !removed.length) continue
    if (field === 'excludedVideos') {
      const findVideo = db.prepare(`SELECT title, artist FROM songs WHERE room_id = ? AND video_id = ?
        ORDER BY created_at DESC, rowid DESC LIMIT 1`)
      const toVideo = (videoId) => ({ videoId, ...(
        findVideo.get(before.id, videoId) ?? { title: videoId, artist: '' }
      ) })
      added = added.map(toVideo)
      removed = removed.map(toVideo)
    }
    changes.push({ field, added, removed })
  }
  return changes
}

module.exports = { recordRoomManagement, settingsChanges }
