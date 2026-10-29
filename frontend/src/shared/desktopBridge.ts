export type DesktopUpdateState = {
  currentVersion: string
  availableVersion: string | null
}

declare global {
  interface Window {
    bsideDesktop?: {
      notifyChat: (message: { roomCode: string; nickname: string; content: string }) => void
      onOpenChat: (callback: (roomCode: string) => void) => () => void
      updates?: {
        getState: () => Promise<DesktopUpdateState | null>
        openDownload: () => Promise<boolean>
        onChange: (callback: (state: DesktopUpdateState) => void) => () => void
      }
    }
  }
}
