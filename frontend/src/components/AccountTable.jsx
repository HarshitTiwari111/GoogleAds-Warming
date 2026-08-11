import { Link } from 'react-router-dom';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function AccountTable({ accounts, onEdit, onDelete }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Account Name</th>
            <th>Client</th>
            <th>Industry</th>
            <th>Status</th>
            <th>Google Ads ID</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((acc) => (
            <tr key={acc._id}>
              <td style={{ fontWeight: 600 }}>{acc.accountName}</td>
              <td>
                {acc.clientName}
                <div className="cell-sub">{acc.clientEmail}</div>
              </td>
              <td>{acc.industry || '-'}</td>
              <td>
                <StatusBadge status={acc.status} />
              </td>
              <td className="info-value mono">{acc.googleAdsCustomerId || '-'}</td>
              <td>{new Date(acc.createdAt).toLocaleDateString()}</td>
              <td>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/accounts/${acc._id}`} className="icon-btn" title="View">
                    <Eye size={15} />
                  </Link>
                  <button className="icon-btn" title="Edit" onClick={() => onEdit(acc)}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => onDelete(acc)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-row">
                No accounts found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
