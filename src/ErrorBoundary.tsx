import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto shadow-2xl border-x border-slate-100">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-4 shadow-lg shadow-red-100">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            حدث خطأ بسيط في النظام
          </h2>
          <p className="text-xs text-gray-500 mb-6 max-w-xs leading-relaxed">
            حدث خطأ غير متوقع أثناء عرض هذه الصفحة. يرجى الضغط على زر إعادة التحميل لمتابعة العمل.
          </p>
          <button
            onClick={this.handleReset}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 transition-all flex items-center gap-2 touch-press"
          >
            <RefreshCw className="w-4 h-4" />
            <span>إعادة تحميل التطبيق</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
