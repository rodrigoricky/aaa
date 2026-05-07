import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Notification from '../components/Notification';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorDetails, getApiErrorMessage } from '../services/api';
import {
  getQaNumberingSettings,
  updateQaNumberingSettings,
  type QaNumberFormat,
  type QaNumberingSettings,
} from '../services/numbering.service';
import styles from './QaNumberingSettings.module.css';

const NUMBER_TOKEN = '{number}';
const PADDED_NUMBER_TOKEN = '000X';
const DATE_TOKEN = '{date}';
const DEFAULT_FORMAT = `QA-${DATE_TOKEN}-${PADDED_NUMBER_TOKEN}`;
const PRESET_FORMATS = [
  { label: 'QA-Date-000X', value: DEFAULT_FORMAT },
  { label: 'QA-000X', value: `QA-${PADDED_NUMBER_TOKEN}` },
];

function normalizeQaFormat(format: string) {
  const trimmed = format.trim();
  if (!trimmed) {
    return DEFAULT_FORMAT;
  }

  if (trimmed === 'QA-Date-000X') {
    return DEFAULT_FORMAT;
  }

  return trimmed;
}

function formatQaSequence(nextValue: number) {
  const value = String(nextValue);
  return value.length >= 3 ? value : value.padStart(4, '0');
}

function getFormatError(format: string) {
  const normalized = normalizeQaFormat(format);
  const tokenCount =
    Number(normalized.includes(NUMBER_TOKEN)) + Number(normalized.includes(PADDED_NUMBER_TOKEN));

  if (!normalized.trim()) {
    return 'Format is required';
  }

  if (tokenCount === 0) {
    return `Format must include ${NUMBER_TOKEN} or ${PADDED_NUMBER_TOKEN}`;
  }

  if (tokenCount > 1) {
    return 'Use only one number token in the format';
  }

  return '';
}

function replaceToken(source: string, token: string, value: string) {
  return source.split(token).join(value);
}

function buildPreview(format: QaNumberFormat, nextValue: number) {
  const normalized = normalizeQaFormat(format);

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return replaceToken(
    replaceToken(
      replaceToken(normalized, DATE_TOKEN, date),
      PADDED_NUMBER_TOKEN,
      formatQaSequence(nextValue)
    ),
    NUMBER_TOKEN,
    String(nextValue)
  );
}

export default function QaNumberingSettings() {
  const { hasRole } = useAuth();
  const canAccess = hasRole('Admin', 'Supervisor');

  const [settings, setSettings] = useState<QaNumberingSettings | null>(null);
  const [format, setFormat] = useState<QaNumberFormat>(DEFAULT_FORMAT);
  const [nextValueInput, setNextValueInput] = useState('1');
  const [dmNextValueInput, setDmNextValueInput] = useState('1');
  const [cmNextValueInput, setCmNextValueInput] = useState('1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formatInputRef = useRef<HTMLInputElement>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  useEffect(() => {
    if (!canAccess) return;

    setLoading(true);
    setError('');
    getQaNumberingSettings()
      .then((result) => {
        setSettings(result);
        setFormat(normalizeQaFormat(result.format));
        setNextValueInput(String(result.nextValue));
        setDmNextValueInput(String(result.dmNextValue));
        setCmNextValueInput(String(result.cmNextValue));
      })
      .catch((requestError) => {
        setError(getApiErrorMessage(requestError, 'Failed to load QA numbering settings'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canAccess]);

  const parsedNextValue = Number(nextValueInput);
  const parsedDmNextValue = Number(dmNextValueInput);
  const parsedCmNextValue = Number(cmNextValueInput);
  const getNumberError = (value: string, parsedValue: number) =>
    value.trim().length === 0
      ? 'Start number is required'
      : !Number.isInteger(parsedValue) || parsedValue < 1
        ? 'Enter a whole number greater than or equal to 1'
        : '';
  const nextValueError = getNumberError(nextValueInput, parsedNextValue);
  const dmNextValueError = getNumberError(dmNextValueInput, parsedDmNextValue);
  const cmNextValueError = getNumberError(cmNextValueInput, parsedCmNextValue);
  const formatError = getFormatError(format);

  const preview = useMemo(
    () => buildPreview(format, Number.isInteger(parsedNextValue) && parsedNextValue > 0 ? parsedNextValue : 1),
    [format, parsedNextValue]
  );
  const dmPreview = Number.isInteger(parsedDmNextValue) && parsedDmNextValue > 0 ? String(parsedDmNextValue) : '1';
  const cmPreview = Number.isInteger(parsedCmNextValue) && parsedCmNextValue > 0 ? String(parsedCmNextValue) : '1';

  const isDirty =
    settings != null &&
    (normalizeQaFormat(settings.format) !== normalizeQaFormat(format) ||
      settings.nextValue !== parsedNextValue ||
      settings.dmNextValue !== parsedDmNextValue ||
      settings.cmNextValue !== parsedCmNextValue);

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const insertToken = (token: string) => {
    const input = formatInputRef.current;
    if (!input) {
      setFormat((current) => `${current}${token}`);
      return;
    }

    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? input.value.length;
    const nextFormat = `${format.slice(0, selectionStart)}${token}${format.slice(selectionEnd)}`;

    setFormat(nextFormat);

    window.requestAnimationFrame(() => {
      input.focus();
      const cursor = selectionStart + token.length;
      input.setSelectionRange(cursor, cursor);
    });
  };

  const handleSave = async () => {
    const numberError = nextValueError || dmNextValueError || cmNextValueError;
    if (formatError || numberError) {
      setError(formatError || numberError);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await updateQaNumberingSettings({
        format: normalizeQaFormat(format),
        nextValue: parsedNextValue,
        dmNextValue: parsedDmNextValue,
        cmNextValue: parsedCmNextValue,
      });
      setSettings(result);
      setFormat(normalizeQaFormat(result.format));
      setNextValueInput(String(result.nextValue));
      setDmNextValueInput(String(result.dmNextValue));
      setCmNextValueInput(String(result.cmNextValue));
      setNotification({ message: 'QA numbering settings saved.', type: 'success' });
    } catch (requestError) {
      const details = getApiErrorDetails<{ format?: string[] }>(requestError);
      setError(details?.format?.[0] || getApiErrorMessage(requestError, 'Failed to save QA numbering settings'));
      setNotification({ message: 'Failed to save QA numbering settings.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>QA Numbering Settings</h1>
          <p className={styles.subtitle}>
            Configure how future quantity adjustment numbers are generated and where the next sequence starts.
          </p>
        </div>

        {loading ? (
          <div className={styles.subtitle}>Loading settings...</div>
        ) : (
          <>
            <div className={styles.grid}>
              <div className={styles.fullWidth}>
                <Input
                  id="qa-number-format"
                  ref={formatInputRef}
                  label="Format"
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                  error={formatError || undefined}
                  placeholder={DEFAULT_FORMAT}
                />
                <p className={styles.helperText}>
                  Add any leading text you need. The format must include exactly one number token.
                </p>

                <div className={styles.tokenRow}>
                  <span className={styles.tokenLabel}>Insert token</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => insertToken(NUMBER_TOKEN)}>
                    {NUMBER_TOKEN}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => insertToken(PADDED_NUMBER_TOKEN)}>
                    {PADDED_NUMBER_TOKEN}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => insertToken(DATE_TOKEN)}>
                    {DATE_TOKEN}
                  </Button>
                </div>

                <div className={styles.presetRow}>
                  <span className={styles.tokenLabel}>Existing presets</span>
                  {PRESET_FORMATS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormat(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Input
                id="qa-number-start"
                label="QA Starting Number"
                type="number"
                min="1"
                step="1"
                value={nextValueInput}
                onChange={(event) => setNextValueInput(event.target.value.replace(/[^0-9]/g, ''))}
                error={nextValueError || undefined}
                placeholder="1"
              />

              <Input
                id="dm-number-start"
                label="DM Starting Number"
                type="number"
                min="1"
                step="1"
                value={dmNextValueInput}
                onChange={(event) => setDmNextValueInput(event.target.value.replace(/[^0-9]/g, ''))}
                error={dmNextValueError || undefined}
                placeholder="1"
              />

              <Input
                id="cm-number-start"
                label="CM Starting Number"
                type="number"
                min="1"
                step="1"
                value={cmNextValueInput}
                onChange={(event) => setCmNextValueInput(event.target.value.replace(/[^0-9]/g, ''))}
                error={cmNextValueError || undefined}
                placeholder="1"
              />
            </div>

            <div className={styles.previewCard}>
              <div>
                <span className={styles.previewLabel}>Next QA Number Preview</span>
                <strong className={styles.previewValue}>{preview}</strong>
              </div>
              <div>
                <span className={styles.previewLabel}>Next DM Number Preview</span>
                <strong className={styles.previewValue}>DM {dmPreview}</strong>
              </div>
              <div>
                <span className={styles.previewLabel}>Next CM Number Preview</span>
                <strong className={styles.previewValue}>CM {cmPreview}</strong>
              </div>
            </div>

            <div className={styles.actions}>
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={!isDirty || Boolean(nextValueError || dmNextValueError || cmNextValueError || formatError)}
              >
                Save
              </Button>
            </div>

            {error && !nextValueError && !dmNextValueError && !cmNextValueError && !formatError && (
              <div className={styles.error}>{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
