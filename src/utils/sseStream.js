export async function readSSEStream(url, body, onText, onDone, onError, abortSignal) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortSignal
    })
  } catch (e) {
    if (e.name !== 'AbortError') onError('Connection failed. Is the server running?')
    return
  }
  if (!res.ok) { onError(`Server error: ${res.status}`); return }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    let result
    try { result = await reader.read() } catch { break }
    const { value, done } = result
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop()

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'text') onText(data.text)
          else if (data.type === 'done') { onDone(); return }
          else if (data.type === 'error') { onError(data.message || 'Unknown error', data.code); return }
        } catch {}
      }
    }
  }
}
