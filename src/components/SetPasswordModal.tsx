import React, { useState } from 'react';
import { makeT } from '../i18n';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { supabase, authLog } from '../lib/supabase';
import { validatePasswordStrength } from '../lib/security';

interface SetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'ar' | 'fr';
  title?: string;
  description?: string;
}

export default function SetPasswordModal({
  isOpen,
  onClose,
  language,
  title,
  description
}: SetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const t = makeT(language);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!password || !confirmPassword) {
      setError(t('Please fill in both password fields', 'يرجى إدخال كلمة المرور وتأكيدها'));
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      setError(
        strength.reason === 'long'
          ? t('Password must not exceed 128 characters', 'كلمة المرور يجب ألا تتجاوز 128 حرفاً')
          : t(
              'Password must be at least 8 characters and include both letters and numbers',
              'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل وتحتوي على حروف وأرقام',
              'Le mot de passe doit contenir au moins 8 caractères avec des lettres et des chiffres'
            )
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(t('Passwords do not match', 'كلمات المرور غير متطابقة'));
      return;
    }

    setLoading(true);
    try {
      authLog('Invoking supabase.auth.updateUser({ password })');
      const { error: updateErr } = await supabase.auth.updateUser({
        password: password
      });

      if (updateErr) throw updateErr;

      authLog('Password updated successfully');
      setSuccess(t(
        'Password updated successfully! You can now log in using email & password.',
        'تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بالبريد وكلمة المرور.',
        'Mot de passe mis à jour avec succès !'
      ));

      setTimeout(() => {
        setPassword('');
        setConfirmPassword('');
        setSuccess('');
        onClose();
      }, 1800);
    } catch (err: any) {
      authLog('Password update error:', err.message);
      setError(err.message || t('Failed to update password', 'فشل تحديث كلمة المرور'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 p-6 relative overflow-hidden animate-scale-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {title || t('Set Email Password', 'تعيين كلمة مرور البريد', 'Définir un mot de passe')}
            </h3>
            <p className="text-xs text-slate-400">
              {description || t('Enable logging in with Email & Password for this account', 'تمكين تسجيل الدخول بالبريد وكلمة المرور لهذا الحساب')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSetPassword} className="space-y-4 mt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('New Password', 'كلمة المرور الجديدة', 'Nouveau mot de passe')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
                style={{ paddingRight: language === 'ar' ? '1rem' : '2.75rem', paddingLeft: language === 'ar' ? '2.75rem' : '1rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className={`absolute ${language === 'ar' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('Confirm Password', 'تأكيد كلمة المرور', 'Confirmer le mot de passe')}
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all"
            />
          </div>

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-slide-down">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-all"
            >
              {t('Cancel', 'إلغاء', 'Annuler')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-md shadow-blue-200 flex items-center justify-center gap-2 transition-all disabled:opacity-70"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('Updating...', 'جاري التحديث...')}</>
              ) : (
                t('Save Password', 'حفظ كلمة المرور', 'Enregistrer')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
