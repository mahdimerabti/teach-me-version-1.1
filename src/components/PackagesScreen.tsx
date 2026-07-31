import { useState } from 'react';
import { ArrowLeft, Check, Crown, Gift, History, Sparkles, Wallet, CreditCard, ShieldCheck, ExternalLink, Loader2 } from 'lucide-react';
import { CREDIT_PACKAGES, purchasePackage, useCreditBalance, type CreditPackage } from '../lib/credits';
import { createChargilyCheckout, type ChargilyPaymentMethod } from '../lib/chargily';
import { CURRENCY_CODE } from '../lib/config';

type Props = {
  language: 'en' | 'ar' | 'fr';
  onBack: () => void;
  onHistory: () => void;
};

export default function PackagesScreen({ language, onBack, onHistory }: Props) {
  const t = (en: string, ar: string, fr?: string) => (language === 'ar' ? ar : (language === 'fr' ? (fr || en) : en));
  const balance = useCreditBalance();
  const [selectedPkg, setSelectedPkg] = useState<CreditPackage | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ChargilyPaymentMethod>('edahabia');
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [justPurchased, setJustPurchased] = useState<CreditPackage | null>(null);

  const initiateBuy = (pkg: CreditPackage) => {
    setSelectedPkg(pkg);
  };

  const handleConfirmChargilyPayment = async () => {
    if (!selectedPkg) return;
    setLoadingCheckout(true);
    try {
      const priceDZD = selectedPkg.price * 200; // Exchange rate approx 200 DZD / USD
      const checkout = await createChargilyCheckout({
        packageId: selectedPkg.id,
        packageName: selectedPkg.name,
        amountDZD: priceDZD,
        paymentMethod: paymentMethod,
        customerName: 'Student User',
        customerEmail: 'student@teachme.dz'
      });

      await purchasePackage(selectedPkg, paymentMethod);
      setJustPurchased(selectedPkg);
      setSelectedPkg(null);

      if (checkout.checkoutUrl && !checkout.isSandboxMode && !checkout.checkoutUrl.startsWith('#')) {
        window.open(checkout.checkoutUrl, '_blank');
      }
    } catch (err: any) {
      alert(t('Payment error: ', 'خطأ في عملية الدفع: ') + err.message);
    } finally {
      setLoadingCheckout(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="font-bold text-gray-900 flex-1">{t('Credit Packages', 'باقات الرصيد')}</h1>
        <button
          onClick={onHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-semibold transition-colors"
        >
          <History className="w-3.5 h-3.5" /> {t('History', 'السجل')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-slide-up pb-8">
        <div className="gradient-animated rounded-3xl p-5 shadow-xl shadow-blue-200/50 flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-blue-100 text-xs">{t('Current Balance', 'رصيدك الحالي')}</p>
            <p className="text-white font-bold text-2xl leading-tight">
              {balance} <span className="text-sm font-semibold">{t('credits', 'رصيد')}</span>
            </p>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-600/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xs text-emerald-800 leading-snug">
            <strong className="font-bold">{t('Secure Online Payment:', 'الدفع الإلكتروني الآمن:')}</strong>{' '}
            {t('Pay securely with EDAHABIA or CIB cards.', 'ادفع بأمان عبر بطاقة الذهبية أو الكارت البنكي CIB.')}
          </p>
        </div>

        {CREDIT_PACKAGES.map(pkg => (
          <div
            key={pkg.id}
            className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all relative ${
              pkg.highlight ? 'border-blue-500 shadow-lg shadow-blue-100' : 'border-gray-100'
            }`}
          >
            {pkg.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-blue-200">
                <Crown className="w-3 h-3" /> {t('Best Value', 'الأفضل قيمة')}
              </span>
            )}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">{language === 'ar' ? pkg.nameAr : pkg.name}</h3>
                <p className="text-3xl font-bold text-blue-600 mt-1">
                  {pkg.credits} <span className="text-sm font-semibold text-gray-400">{t('credits', 'رصيد')}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900 text-xl">{(pkg.price * 200).toLocaleString()} {t('DZD', 'د.ج')}</p>
              </div>

            </div>
            <div className="mt-3 space-y-1.5">
              <p className="flex items-center gap-2 text-xs text-gray-600">
                <Check className="w-3.5 h-3.5 text-green-500" />
                {t(`${pkg.credits} session credits (valid 90 days)`, `${pkg.credits} رصيد للحصص (صالح 90 يوماً)`)}
              </p>
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                <Gift className="w-3.5 h-3.5" /> {language === 'ar' ? pkg.giftAr : pkg.gift}
              </p>
            </div>
            <button
              onClick={() => initiateBuy(pkg)}
              className={`mt-4 w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                pkg.highlight
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              {t('Pay Securely (EDAHABIA / CIB)', 'ادفع بأمان (الذهبية / CIB)')}
            </button>
          </div>
        ))}
      </div>

      {/* Payment Modal */}
      {selectedPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedPkg(null)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-bounce-in">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-600/10 text-emerald-600 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">{t('Secure Checkout', 'إتمام الدفع الإلكتروني الآمن')}</h3>
                  <p className="text-xs text-gray-400">{t('256-Bit SSL Encrypted Payment', 'عملية دفع مشفرة وآمنة 100%')}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{t('Selected Package:', 'الباقة المختارة:')}</span>
                <span className="font-bold text-gray-800">{language === 'ar' ? selectedPkg.nameAr : selectedPkg.name}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{t('Total Credits:', 'مجموع الأرصدة:')}</span>
                <span className="font-bold text-blue-600">{selectedPkg.credits + selectedPkg.bonusCredits} {t('credits', 'رصيد')}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-2">
                <span>{t('Total Price:', 'المبلغ الإجمالي:')}</span>
                <span className="text-emerald-600">{selectedPkg.price * 200} DZD</span>
              </div>
            </div>

            <p className="text-xs font-bold text-gray-700 mb-2">{t('Select Payment Card:', 'اختر بطاقة الدفع:')}</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setPaymentMethod('edahabia')}
                className={`p-3.5 rounded-2xl border-2 text-center transition-all flex flex-col items-center gap-1.5 ${
                  paymentMethod === 'edahabia'
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 shadow-sm'
                    : 'border-gray-100 hover:border-gray-200 text-gray-600'
                }`}
              >
                <div className="w-8 h-8 bg-amber-500 text-white font-black text-[10px] rounded-lg flex items-center justify-center shadow">
                  EDAHABIA
                </div>
                <span className="text-xs font-bold">{t('الذهبية (Algérie Poste)', 'الذهبية (بريد الجزائر)')}</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cib')}
                className={`p-3.5 rounded-2xl border-2 text-center transition-all flex flex-col items-center gap-1.5 ${
                  paymentMethod === 'cib'
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 shadow-sm'
                    : 'border-gray-100 hover:border-gray-200 text-gray-600'
                }`}
              >
                <div className="w-8 h-8 bg-blue-600 text-white font-black text-[10px] rounded-lg flex items-center justify-center shadow">
                  CIB
                </div>
                <span className="text-xs font-bold">{t('CIB (Interbank Card)', 'CIB (البنكية)')}</span>
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedPkg(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
              >
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleConfirmChargilyPayment}
                disabled={loadingCheckout}
                className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loadingCheckout ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('Processing Payment...', 'جاري معالجة الدفع...')}</>
                ) : (
                  <><ExternalLink className="w-4 h-4" /> {t('Proceed to Checkout', 'متابعة عملية الدفع')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Success Modal */}
      {justPurchased && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setJustPurchased(null)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm text-center animate-bounce-in shadow-2xl">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg">{t('Payment Successful!', 'تم الدفع الإلكتروني بنجاح!')}</h3>

            <p className="text-sm text-gray-500 mt-2">
              {t(
                `${justPurchased.credits} credits + ${justPurchased.bonusCredits} bonus added to your balance.`,
                `تمت إضافة ${justPurchased.credits} رصيد + ${justPurchased.bonusCredits} رصيد مجاني إلى حسابك.`
              )}
            </p>
            <p className="text-2xl font-bold text-blue-600 mt-3">
              {balance} {t('credits', 'رصيد')}
            </p>
            <button
              onClick={() => setJustPurchased(null)}
              className="mt-5 w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
            >
              {t('Done', 'تم')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

