import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel, danger = true }) {
  // Guards against double-click double-submission: the button disables itself
  // the instant it's clicked and stays disabled until onConfirm's promise
  // settles, regardless of whether the caller also tracks its own busy state.
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  // Portal to <body>: an ancestor with backdrop-filter/transform (e.g. the
  // sticky .page-header that hosts ProfileMenu) becomes the containing block
  // for position:fixed, which pinned the overlay inside the header instead
  // of covering the viewport.
  return createPortal(
    <div className="modal-overlay" onClick={submitting ? undefined : onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            className={danger ? 'modal-btn-confirm' : 'refresh-btn'}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
