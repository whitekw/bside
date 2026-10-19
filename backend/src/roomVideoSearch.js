async function searchRoomVideos(rooms, youtube, code, credentials, query) {
  // Check room access and query validity before making an external request.
  rooms.getSearchHistory(code, credentials, query)
  const videos = await youtube.search(query)
  const history = rooms.getSearchHistory(code, credentials, query, videos.map(video => video.videoId))
  const remote = new Map(videos.map(video => [video.videoId, video]))
  const played = new Set(history.map(video => video.videoId))
  return [
    ...history.map(video => ({ ...video, ...remote.get(video.videoId), previouslyPlayed: true })),
    ...videos.filter(video => !played.has(video.videoId)),
  ]
}

module.exports = { searchRoomVideos }
