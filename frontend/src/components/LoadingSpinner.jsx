/**
 * A spinning ring in the app's accent color, instead of a generic
 * OS-style spinner.
 */
export default function LoadingSpinner({ label, fullHeight = false }) {
  return (
    <div className={`loading-spinner-wrap${fullHeight ? ' loading-spinner-full' : ''}`}>
      <div className="loading-spinner-ring" />
      {label && <p className="loading-spinner-label">{label}</p>}
    </div>
  );
}
