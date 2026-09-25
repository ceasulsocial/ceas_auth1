// src/components/AdminApplications.jsx
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './AdminApplications.css';

export default function AdminApplications() {
  const { user, profile } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'approved' | 'rejected' | 'all'
  const [selected, setSelected] = useState(null);
  const [signedUrls, setSignedUrls] = useState({});   // { [path]: url }
  const [actionLoading, setActionLoading] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  // ── Fetch applications ──
  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('trainer_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setApplications(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!profile?.is_admin) return;
    fetchApplications();
  }, [fetchApplications, profile?.is_admin]);

  // ── Sign URLs when an application is selected ──
  useEffect(() => {
    if (!selected) return;

    const signAll = async () => {
      const map = {};
      for (const cred of selected.credentials || []) {
        if (signedUrls[cred.path]) {
          map[cred.path] = signedUrls[cred.path];
          continue;
        }
        const { data, error } = await supabase.storage
          .from('trainer-credentials')
          .createSignedUrl(cred.path, 60 * 60); // 1 hour
        if (!error && data) {
          map[cred.path] = data.signedUrl;
        }
      }
      setSignedUrls((prev) => ({ ...prev, ...map }));
    };

    signAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ── Approve ──
  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading('approve');
    try {
      // 1. Update application
      const { error: updateError } = await supabase
        .from('trainer_applications')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: reviewNote.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id);

      if (updateError) throw updateError;

      // 2. Update the user's role
      const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: 'trainer' })
        .eq('id', selected.user_id);

      if (roleError) throw roleError;

      setSelected(null);
      setReviewNote('');
      await fetchApplications();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Decline ──
  const handleDecline = async () => {
    if (!selected) return;
    setActionLoading('decline');
    try {
      const { error: updateError } = await supabase
        .from('trainer_applications')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: reviewNote.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id);

      if (updateError) throw updateError;

      setSelected(null);
      setReviewNote('');
      await fetchApplications();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Guard ──
  if (!profile?.is_admin) {
    return (
      <div className="admin-guard">
        <p>You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-applications">
      <div className="aa-header">
        <h2>Trainer Applications</h2>
        <div className="aa-filters">
          {['pending', 'approved', 'rejected', 'all'].map((f) => (
            <button
              key={f}
              className={`aa-filter ${filter === f ? 'aa-filter--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="aa-error">{error}</div>}

      {loading ? (
        <div className="aa-loading">Loading…</div>
      ) : applications.length === 0 ? (
        <div className="aa-empty">No {filter} applications.</div>
      ) : (
        <div className="aa-layout">
          {/* List */}
          <div className="aa-list">
            {applications.map((app) => (
              <button
                key={app.id}
                className={`aa-item ${
                  selected?.id === app.id ? 'aa-item--active' : ''
                }`}
                onClick={() => {
                  setSelected(app);
                  setReviewNote(app.reviewer_notes || '');
                }}
              >
                <div className="aa-item-name">{app.full_name}</div>
                <div className="aa-item-meta">
                  <span className={`aa-status aa-status--${app.status}`}>
                    {app.status}
                  </span>
                  <span className="aa-item-date">
                    {new Date(app.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="aa-item-files">
                  {app.credentials?.length || 0} file
                  {app.credentials?.length === 1 ? '' : 's'}
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="aa-detail">
            {!selected ? (
              <div className="aa-empty-detail">
                Select an application to review
              </div>
            ) : (
              <>
                <div className="aa-detail-header">
                  <h3>{selected.full_name}</h3>
                  <span className={`aa-status aa-status--${selected.status}`}>
                    {selected.status}
                  </span>
                </div>

                <div className="aa-section">
                  <h4>Bio</h4>
                  <p>{selected.bio}</p>
                </div>

                {selected.experience && (
                  <div className="aa-section">
                    <h4>Experience</h4>
                    <p>{selected.experience}</p>
                  </div>
                )}

                <div className="aa-section">
                  <h4>Credentials</h4>
                  <div className="aa-credentials">
                    {(selected.credentials || []).map((cred, i) => {
                      const url = signedUrls[cred.path];
                      const isImage = cred.type?.startsWith('image/');
                      const isVideo = cred.type?.startsWith('video/');

                      return (
                        <div key={i} className="aa-credential">
                          {isImage && url && (
                            <img
                              src={url}
                              alt={cred.name}
                              className="aa-credential-thumb"
                            />
                          )}
                          {isVideo && url && (
                            <video
                              src={url}
                              controls
                              className="aa-credential-video"
                            />
                          )}
                          {!isImage && !isVideo && (
                            <div className="aa-credential-icon">📄</div>
                          )}

                          <div className="aa-credential-info">
                            <div className="aa-credential-name">
                              {cred.name}
                            </div>
                            <div className="aa-credential-size">
                              {(cred.size / 1024 / 1024).toFixed(1)} MB
                            </div>
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="aa-credential-open"
                              >
                                Open in new tab
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selected.status === 'pending' && (
                  <>
                    <div className="aa-section">
                      <h4>Review notes (optional)</h4>
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Notes shown to the applicant (decline reason, feedback, etc.)"
                        rows={3}
                        maxLength={500}
                      />
                    </div>

                    <div className="aa-actions">
                      <button
                        className="aa-decline"
                        onClick={handleDecline}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === 'decline'
                          ? 'Declining…'
                          : 'Decline'}
                      </button>
                      <button
                        className="aa-approve"
                        onClick={handleApprove}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === 'approve'
                          ? 'Approving…'
                          : 'Approve'}
                      </button>
                    </div>
                  </>
                )}

                {selected.status !== 'pending' && (
                  <div className="aa-reviewed-info">
                    <p>
                      <strong>Reviewed:</strong>{' '}
                      {selected.reviewed_at
                        ? new Date(selected.reviewed_at).toLocaleString()
                        : '—'}
                    </p>
                    {selected.reviewer_notes && (
                      <p>
                        <strong>Notes:</strong> {selected.reviewer_notes}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}