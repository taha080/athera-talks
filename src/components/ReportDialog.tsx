import { useState } from 'react'
import { REPORT_REASONS } from '../lib/chatList'
import { fieldClass, ghostButton, primaryButton } from '../lib/styles'
import { CloseIcon } from './Icons'

export function ReportDialog({
  username,
  onClose,
  onSubmit,
}: {
  username: string
  onClose: () => void
  onSubmit: (reason: string, details: string) => Promise<void>
}) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>('Spam')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await onSubmit(reason, details)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Report @${username}`}>
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Report @{username}</h2>
            <p className="mt-1 text-xs leading-5 text-mist">The creator reviews reports. This person is not told that you sent one.</p>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-mist hover:text-paper" aria-label="Close report" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <label className="mt-3 block text-xs font-medium text-mist">
          Reason
          <select className={`${fieldClass} mt-1`} value={reason} onChange={(event) => setReason(event.target.value as (typeof REPORT_REASONS)[number])}>
            {REPORT_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs font-medium text-mist">
          Details
          <textarea
            className={`${fieldClass} mt-1 min-h-20 resize-y`}
            maxLength={1000}
            value={details}
            placeholder="Optional"
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={busy} onClick={() => void submit()}>
            Send report
          </button>
        </div>
      </div>
    </div>
  )
}
