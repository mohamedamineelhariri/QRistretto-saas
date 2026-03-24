'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { 
    Building2, 
    User, 
    Mail, 
    Lock,
    CheckCircle2,
    Crown,
    Zap,
    Loader2
} from 'lucide-react';

export default function SignupClient() {
    const router = useRouter();
    const [plans, setPlans] = useState<any[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState(true);
    
    const [step, setStep] = useState(1);
    const [selectedPlan, setSelectedPlan] = useState<string>('');
    
    // Form state
    const [formData, setFormData] = useState({
        businessName: '',
        ownerName: '',
        email: '',
        password: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const res = await api.getPublicPlans();
                if (res.success && res.data) {
                    setPlans(res.data.plans || []);
                }
            } catch (err) {
                console.error("Failed to load plans", err);
            } finally {
                setIsLoadingPlans(false);
            }
        };
        fetchPlans();
    }, []);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (success && countdown > 0) {
            timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        } else if (success && countdown === 0) {
            router.push('/admin/dashboard');
        }
        return () => clearTimeout(timer);
    }, [success, countdown, router]);

    const handleNextStep = () => {
        if (!selectedPlan) {
            setError('Please select a plan to continue');
            return;
        }
        setError('');
        setStep(2);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const res = await api.signup({
                ...formData,
                planName: selectedPlan
            });
            
            if (res.success && res.data) {
                // Auto-login logic
                const { token, user, tenant, locationId } = res.data;
                api.setToken(token);
                localStorage.setItem('admin_token', token);
                localStorage.setItem('admin_info', JSON.stringify({
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    tenantId: tenant.id,
                    locationId: locationId,
                }));

                setSuccess(true);
            } else {
                setError(res.message || 'Registration failed');
            }
        } catch (err: any) {
            setError(err.message || 'A network error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-3xl p-8 text-center shadow-2xl">
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-4">Welcome to QRistretto!</h2>
                    <p className="text-stone-400 mb-8">
                        Your account for <strong>{formData.businessName}</strong> has been created. 
                        Redirecting you to your dashboard in {countdown} seconds...
                    </p>
                    <button
                        onClick={() => router.push('/admin/dashboard')}
                        className="bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 w-full font-bold transition-colors shadow-lg shadow-red-500/20"
                    >
                        Go to Dashboard Now
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-950 text-white pb-12">
            {/* Header */}
            <header className="border-b border-stone-800 bg-stone-950/50 backdrop-blur sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
                <div className="text-xl font-bold">QRistretto</div>
                <div className="flex bg-stone-900 rounded-full p-1 border border-stone-800">
                    <div className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${step === 1 ? 'bg-red-500 text-white' : 'text-stone-400'}`}>1. Plan</div>
                    <div className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${step === 2 ? 'bg-red-500 text-white' : 'text-stone-400'}`}>2. Details</div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto pt-12 px-4">
                {step === 1 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center mb-10">
                            <h1 className="text-4xl font-extrabold tracking-tight mb-4">Choose Your Tier</h1>
                            <p className="text-stone-400 text-lg">Scale your restaurant with production-grade tools.</p>
                        </div>

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-center font-medium">
                                {error}
                            </div>
                        )}

                        {isLoadingPlans ? (
                            <div className="flex justify-center p-12">
                                <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-3 gap-6">
                                {plans.map((plan) => {
                                    const isSelected = selectedPlan === plan.name;
                                    const isPro = plan.name === 'PRO';
                                    const isEnterprise = plan.name === 'ENTERPRISE';

                                    return (
                                        <div 
                                            key={plan.id}
                                            onClick={() => setSelectedPlan(plan.name)}
                                            className={`relative cursor-pointer transition-all duration-300 rounded-3xl p-6 border-2 flex flex-col hover:-translate-y-1 ${
                                                isSelected 
                                                    ? 'border-red-500 bg-red-500/5 shadow-xl shadow-red-500/10' 
                                                    : 'border-stone-800 bg-stone-900 hover:border-stone-700'
                                            }`}
                                        >
                                            {isPro && (
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full flex items-center gap-1">
                                                    <Zap className="w-3 h-3" /> Popular
                                                </div>
                                            )}
                                            {isEnterprise && (
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-stone-950 text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full flex items-center gap-1">
                                                    <Crown className="w-3 h-3" /> Maximum Power
                                                </div>
                                            )}

                                            <h3 className="text-xl font-bold mb-2">{plan.displayName}</h3>
                                            <div className="flex items-baseline gap-1 mb-6">
                                                <span className="text-3xl font-extrabold">{(plan.priceMAD / 100).toLocaleString()}</span>
                                                <span className="text-stone-400">MAD/mo</span>
                                            </div>

                                            <div className="space-y-3 mb-8 flex-1">
                                                {(plan.features as string[] || []).map((feature: string, idx: number) => (
                                                    <div key={idx} className="flex gap-2 text-sm text-stone-300">
                                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                                        <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className={`w-full py-3 rounded-xl text-center font-bold transition-colors ${
                                                isSelected ? 'bg-red-500 text-white' : 'bg-stone-800 text-white'
                                            }`}>
                                                {isSelected ? 'Selected' : 'Select Plan'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="mt-12 flex justify-center">
                            <button
                                onClick={handleNextStep}
                                className="bg-white hover:bg-stone-200 text-stone-950 font-bold py-4 px-12 rounded-2xl transition-colors shadow-lg shadow-white/5"
                            >
                                Continue to Next Step
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-xl mx-auto">
                        <div className="text-center mb-10">
                            <h1 className="text-4xl font-extrabold tracking-tight mb-4">Create Your Account</h1>
                            <p className="text-stone-400 text-lg">You selected the <strong>{selectedPlan}</strong> plan.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="bg-stone-900 border border-stone-800 rounded-3xl p-8 shadow-2xl">
                            {error && (
                                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm font-medium">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-stone-300">Restaurant / Business Name</label>
                                    <div className="relative">
                                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                                        <input
                                            type="text"
                                            value={formData.businessName}
                                            onChange={e => setFormData({...formData, businessName: e.target.value})}
                                            required
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                            placeholder="Cafe Atlas"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-stone-300">Owner Full Name</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                                        <input
                                            type="text"
                                            value={formData.ownerName}
                                            onChange={e => setFormData({...formData, ownerName: e.target.value})}
                                            required
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                            placeholder="Karim Bensouda"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-stone-300">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                            required
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                            placeholder="karim@cafeatlas.com"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-stone-300">Secure Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                                        <input
                                            type="password"
                                            value={formData.password}
                                            onChange={e => setFormData({...formData, password: e.target.value})}
                                            required
                                            minLength={8}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    disabled={isSubmitting}
                                    className="bg-stone-800 hover:bg-stone-700 text-white rounded-xl py-4 px-6 font-semibold transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-4 flex items-center justify-center font-bold transition-colors disabled:opacity-50 shadow-lg shadow-red-500/20"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Complete Registration'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </main>
        </div>
    );
}
