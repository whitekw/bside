import type { Translate } from '../../shared/i18n/i18n-context'
import type { RoomManagementEntry } from './types'

export function managementHistoryDetails(entry: RoomManagementEntry, t: Translate) {
  const rows: { text: string; videoId?: string; title?: string; artist?: string }[] = []
  for (const change of entry.changes) {
    if (change.field === 'excludedVideos') {
      for (const [action, videos] of [['added', change.added], ['removed', change.removed]] as const) {
        for (const video of videos) rows.push({ text: t(`roomManagement.video.${action}`), ...video })
      }
    } else if (change.field === 'excludedWords') {
      for (const [action, words] of [['added', change.added], ['removed', change.removed]] as const) {
        for (const word of words) rows.push({ text: t(`roomManagement.word.${action}`, { word }) })
      }
    } else if (change.field === 'isManager') {
      rows.push({ text: t(change.after ? 'roomManagement.managerAdded' : 'roomManagement.managerRemoved',
        { name: entry.targetName ?? t('roomManagement.deletedUser') }) })
    } else {
      const format = (value: string | boolean | number) => {
        if (typeof value === 'boolean') return t(value ? 'roomManagement.enabled' : 'roomManagement.disabled')
        if (change.field === 'autoplayMode') return t(value === 'shuffle' ? 'roomSettings.mode.shuffle' : 'roomSettings.mode.random')
        if (change.field === 'minDurationSeconds' || change.field === 'maxDurationSeconds') {
          return `${Math.floor(Number(value) / 60)}:${String(Number(value) % 60).padStart(2, '0')}`
        }
        if (change.field === 'hostVolume') return `${value}%`
        return String(value)
      }
      rows.push({ text: `${t(`roomManagement.field.${change.field}`)} · ${format(change.before)} → ${format(change.after)}` })
    }
  }
  return rows
}
