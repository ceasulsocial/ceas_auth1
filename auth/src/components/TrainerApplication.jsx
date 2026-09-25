// src/components/TrainerApplication.jsx
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './TrainerApplication.css';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_FILES = 10;

export default function TrainerApplication() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bio, setBio] = useState('');
  const [experience, setExperience] = useState('');
  const [files, setFiles] = useState([]);          // [{ file, name, size, type }]
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // ── File selection ──
  const handleFileSelect = useCallback((fileList) => {
    const incoming = Array.from(fileList);
    const accepted = [];

    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 50MB`);
        continue;
      }
      accepted.push(file);
    }

    setFiles((prev) => {
      const combined = [...prev, ...accepted].slice(0, MAX_FILES);
      if (prev.length + accepted.length > MAX_FILES) {
        setError(`Max ${MAX_FILES} files allowed`);
      }
      return combined;
    });
  }, []);

  const handleFileChange = (e) => {
    if (!e.target.files?.length) return;
    handleFileSelect(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer?.files?.length) return;
    handleFileSelect(e.dataTransfer.files);
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (bio.trim().length < 20) {
      setError('Please write at least 20 characters in your bio');
      return;
    }
    if (files.length === 0) {
      setError('Please upload at least one credential file');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Upload files
      setUploading(true);
      const uploadedCredentials = [];

      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const path = `${user.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('trainer-credentials')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (uploadError) throw uploadError;

        uploadedCredentials.push({
          path,                     // used to generate signed URLs later
          name: file.name,
          type: file.type,
          size: file.size,
        });
      }
      setUploading(false);

      // 2. Insert application row
      const { error: insertError } = await supabase
        .from('trainer_applications')
        .insert({
          user_id: user.id,
          full_name: fullName.trim(),
          bio: bio.trim(),
          experience: experience.trim() || null,
          credentials: uploadedCredentials,
          status: 'pending',
        });

      if (insertError) {
        // Rollback uploaded files if insert fails
        const paths = uploadedCredentials.map((c) => c.path);
        if (paths.length) {
          await supabase.storage.from('trainer-credentials').remove(paths);
        }
        throw insertError;
      }

      // 3. Navigate back with success flag
      navigate('/', { state: { applicationSubmitted: true } });
    } catch (err) {
      console.error('Application error:', err);
      setError(err.message || 'Failed to submit application');
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="trainer-application">
      <div className="trainer-application-card">
        <h2>Apply to become a Trainer</h2>
        <p className="trainer-application-subtitle">
          Tell us about yourself and upload any credentials that show your
          proficiency — certifications, recordings, portfolios, references,
          anything you'd like us to review.
        </p>

        <form onSubmit={handleSubmit} className="trainer-application-form">
          {/* Full name */}
          <div className="ta-field">
            <label htmlFor="ta-name">Full name</label>
            <input
              id="ta-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your legal or professional name"
              maxLength={120}
              required
            />
          </div>

          {/* Bio */}
          <div className="ta-field">
            <label htmlFor="ta-bio">
              Short bio <span className="ta-hint">(min. 20 characters)</span>
            </label>
            <textarea
              id="ta-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Who are you, and what kind of coaching do you offer?"
              rows={5}
              maxLength={1000}
              required
            />
            <div className="ta-charcount">{bio.length}/1000</div>
          </div>

          {/* Experience */}
          <div className="ta-field">
            <label htmlFor="ta-exp">
              Relevant experience <span className="ta-hint">(optional)</span>
            </label>
            <textarea
              id="ta-exp"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Years of experience, notable clients, areas of expertise…"
              rows={4}
              maxLength={2000}
            />
            <div className="ta-charcount">{experience.length}/2000</div>
          </div>

          {/* Files */}
          <div className="ta-field">
            <label>
              Credentials
              <span className="ta-hint">
                (up to {MAX_FILES} files, 50MB each — PDF, image, video, text,
                anything)
              </span>
            </label>

            <div
              className="ta-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('ta-dropzone--over');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('ta-dropzone--over');
              }}
              onDrop={(e) => {
                e.currentTarget.classList.remove('ta-dropzone--over');
                handleDrop(e);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="ta-dropzone-icon">📎</div>
              <div className="ta-dropzone-text">
                Drag files here or click to browse
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {files.length > 0 && (
              <ul className="ta-file-list">
                {files.map((f, i) => (
                  <li key={i} className="ta-file">
                    <span className="ta-file-name">{f.name}</span>
                    <span className="ta-file-size">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      className="ta-file-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(i);
                      }}
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="ta-error">{error}</div>}

          <div className="ta-actions">
            <button
              type="button"
              className="ta-cancel"
              onClick={() => navigate('/')}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ta-submit"
              disabled={submitting || files.length === 0}
            >
              {uploading
                ? 'Uploading files…'
                : submitting
                ? 'Submitting…'
                : 'Submit application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}