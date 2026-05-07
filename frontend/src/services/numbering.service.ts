import api from './api';

export type QaNumberFormat = string;

export interface QaNumberingSettings {
  format: QaNumberFormat;
  nextValue: number;
  preview: string;
  dmNextValue: number;
  dmPreview: string;
  cmNextValue: number;
  cmPreview: string;
}

export async function getQaNumberingSettings(): Promise<QaNumberingSettings> {
  const res = await api.get<{ success: boolean; data: QaNumberingSettings }>('/numbering/qa');
  return res.data.data;
}

export async function updateQaNumberingSettings(input: {
  format: QaNumberFormat;
  nextValue: number;
  dmNextValue: number;
  cmNextValue: number;
}): Promise<QaNumberingSettings> {
  const res = await api.put<{ success: boolean; data: QaNumberingSettings }>('/numbering/qa', input);
  return res.data.data;
}
