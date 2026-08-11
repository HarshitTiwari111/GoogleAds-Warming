import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import { usersApi, unwrap } from '../services/api';
import { useToast } from '../context/ToastContext';

const ROLE_OPTIONS = ['admin', 'user'];
const PAGE_SIZE = 10;

const emptyCreateForm = { name: '', email: '', password: '', role: 'user' };

function UserCard({ user, onSave, onDeactivateToggle, onDelete }) {
  const [form, setForm] = useState({
    role: user.role,
    telegramChatId: user.telegramChatId || '',
    telegramBotToken: user.telegramBotToken || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    form.role !== user.role ||
    form.telegramChatId !== (user.telegramChatId || '') ||
    form.telegramBotToken !== (user.telegramBotToken || '');

  const handleChange = (field) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(user._id, form);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`card ${user.active === false ? 'accent-neutral' : 'accent-blue'}`}>
      <div className="card-header">
        <div>
          <h3>{user.name}</h3>
          <span className="cell-sub">{user.email}</span>
        </div>
        <span className={`pill ${user.active === false ? 'pill-neutral' : 'pill-success'}`}>
          {user.active === false ? 'Inactive' : 'Active'}
        </span>
      </div>

      <label className="field">
        <span>Role</span>
        <select value={form.role} onChange={handleChange('role')}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Telegram Chat ID</span>
        <input
          type="text"
          value={form.telegramChatId}
          onChange={handleChange('telegramChatId')}
          placeholder="Telegram chat ID"
          autoComplete="off"
        />
      </label>

      <label className="field">
        <span>Telegram Bot Token</span>
        <input
          type="text"
          value={form.telegramBotToken}
          onChange={handleChange('telegramBotToken')}
          placeholder="Telegram bot token"
          autoComplete="off"
        />
      </label>

      <div className="rule-card-footer">
        {saved && !isDirty ? <span className="saved-indicator">Saved</span> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary-outline"
            style={{ color: '#ef4444', borderColor: '#ef4444' }}
            onClick={() => onDelete(user)}
          >
            Delete
          </button>
          <button
            className="btn-secondary-outline"
            onClick={() => onDeactivateToggle(user)}
          >
            {user.active === false ? 'Activate' : 'Deactivate'}
          </button>
          <button className="refresh-btn" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);

  const loadUsers = () => {
    setLoading(true);
    return usersApi
      .list()
      .then((res) => {
        setUsers(unwrap(res) || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateChange = (field) => (e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setSubmitting(true);
    try {
      await usersApi.create(createForm);
      showToast('User created');
      setShowCreate(false);
      setCreateForm(emptyCreateForm);
      loadUsers();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (id, data) => {
    try {
      await usersApi.update(id, data);
      showToast('User updated');
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update user', 'error');
      throw err;
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      await usersApi.update(toggleTarget._id, { active: toggleTarget.active === false });
      showToast(toggleTarget.active === false ? 'User activated' : 'User deactivated');
      setToggleTarget(null);
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update user', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await usersApi.removePermanent(deleteTarget._id);
      showToast('User deleted permanently');
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete user', 'error');
    }
  };

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedUsers = users.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="page">
      <PageHeader
        title="Users"
        subtitle="Manage team members, roles & Telegram alert delivery"
        actions={
          <button className="refresh-btn" onClick={() => setShowCreate(true)}>
            <Plus size={15} />
            New User
          </button>
        }
      />

      {error && (
        <div className="error-banner">
          Could not load users. ({error.message})
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Loading users…" />
      ) : users.length === 0 ? (
        <div className="table-wrapper">
          <table>
            <tbody>
              <tr>
                <td className="empty-row">No users found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="card-grid">
            {pagedUsers.map((u) => (
              <UserCard key={u._id} user={u} onSave={handleSave} onDeactivateToggle={setToggleTarget} onDelete={setDeleteTarget} />
            ))}
          </div>
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>New User</h3>
            <p>Create a new team member account.</p>

            {createError && <div className="error-banner">{createError}</div>}

            {/* autoComplete: "new-password" keeps Chrome from treating this
                admin form as a login form and autofilling saved credentials. */}
            <form onSubmit={handleCreate} autoComplete="off">
              <label className="field">
                <span>Name *</span>
                <input type="text" value={createForm.name} onChange={handleCreateChange('name')} autoComplete="off" required />
              </label>
              <label className="field">
                <span>Email *</span>
                <input type="email" value={createForm.email} onChange={handleCreateChange('email')} autoComplete="off" required />
              </label>
              <label className="field">
                <span>Password *</span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={handleCreateChange('password')}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="field">
                <span>Role</span>
                <select value={createForm.role} onChange={handleCreateChange('role')}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="refresh-btn" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toggleTarget && (
        <ConfirmModal
          title={toggleTarget.active === false ? 'Activate user?' : 'Deactivate user?'}
          message={`Are you sure you want to ${toggleTarget.active === false ? 'activate' : 'deactivate'} "${toggleTarget.name}"?`}
          confirmLabel={toggleTarget.active === false ? 'Activate' : 'Deactivate'}
          danger={toggleTarget.active !== false}
          onConfirm={handleConfirmToggle}
          onCancel={() => setToggleTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete user permanently?"
          message={`This will permanently delete "${deleteTarget.name}" (${deleteTarget.email}) and their synced Google Ads data. This cannot be undone.`}
          confirmLabel="Delete Permanently"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
