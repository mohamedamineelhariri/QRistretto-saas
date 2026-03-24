'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { 
    UtensilsCrossed, 
    Grid2X2, 
    Users, 
    QrCode,
    CheckCircle2,
    ArrowRight
} from 'lucide-react';

export default function OnboardingClient() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            const token = localStorage.getItem('admin_token');
            if (!token) {
                router.push('/admin');
                return;
            }
            setIsLoading(false);
        };
        init();
    }, [router]);

    if (isLoading) return <div className="min-h-screen bg-stone-950 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div></div>;

    const steps = [
        {
            num: 1,
            title: "Configure Menu",
            description: "Add your first categories and items to the digital menu.",
            icon: UtensilsCrossed
        },
        {
            num: 2,
            title: "Layout Tables",
            description: "Define the physical space and generate unique QR codes.",
            icon: Grid2X2
        },
        {
            num: 3,
            title: "Invite Staff",
            description: "Add waiters and kitchen staff to the platform.",
            icon: Users
        },
        {
            num: 4,
            title: "Go Live",
            description: "Print your QR codes and start receiving orders.",
            icon: QrCode
        }
    ];

    const currentStepConfig = steps.find(s => s.num === step)!;

    return (
        <div className="min-h-screen bg-stone-950 flex flex-col items-center py-12 px-4">
            <div className="max-w-4xl w-full">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-4">Welcome to QRistretto</h1>
                    <p className="text-xl text-stone-400">Let's get your platform set up in 4 simple steps.</p>
                </div>

                {/* Progress Bar */}
                <div className="mb-12">
                    <div className="flex justify-between items-center relative">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-stone-800 -z-10 rounded-full"></div>
                        <div 
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-red-500 rounded-full -z-10 transition-all duration-500"
                            style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
                        ></div>
                        
                        {steps.map((s) => (
                            <div key={s.num} className="flex flex-col items-center">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-colors ${
                                    step > s.num 
                                        ? 'bg-red-500 border-red-500 text-white' 
                                        : step === s.num 
                                            ? 'bg-stone-900 border-red-500 text-red-500' 
                                            : 'bg-stone-900 border-stone-800 text-stone-500'
                                }`}>
                                    {step > s.num ? <CheckCircle2 className="w-6 h-6" /> : <s.icon className="w-5 h-5" />}
                                </div>
                                <span className={`mt-3 text-sm font-medium ${step >= s.num ? 'text-white' : 'text-stone-500'}`}>
                                    {s.title}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Step Content Area */}
                <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8 md:p-12 shadow-2xl min-h-[400px] flex flex-col">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20">
                            {(() => {
                                const Icon = currentStepConfig.icon;
                                return <Icon className="w-8 h-8" />;
                            })()}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{currentStepConfig.title}</h2>
                            <p className="text-stone-400">{currentStepConfig.description}</p>
                        </div>
                    </div>

                    <div className="flex-1 my-8 flex items-center justify-center border-2 border-dashed border-stone-800 rounded-2xl bg-stone-950/50">
                        {step === 1 && (
                            <div className="text-center p-8">
                                <UtensilsCrossed className="w-12 h-12 text-stone-600 mx-auto mb-4" />
                                <button className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl font-medium transition-colors">
                                    + Create First Category
                                </button>
                            </div>
                        )}
                        {step === 2 && (
                            <div className="text-center p-8">
                                <Grid2X2 className="w-12 h-12 text-stone-600 mx-auto mb-4" />
                                <button className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl font-medium transition-colors">
                                    + Add Table Layout
                                </button>
                            </div>
                        )}
                        {step === 3 && (
                            <div className="text-center p-8">
                                <Users className="w-12 h-12 text-stone-600 mx-auto mb-4" />
                                <button className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl font-medium transition-colors">
                                    + Add Staff Member
                                </button>
                            </div>
                        )}
                        {step === 4 && (
                            <div className="text-center p-8">
                                <QrCode className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                                <h3 className="text-emerald-500 font-bold mb-2">Setup Complete!</h3>
                                <p className="text-stone-400 text-sm max-w-sm mx-auto">Your platform is ready to accept orders. Let's head to the dashboard to monitor your live operations.</p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-4 mt-auto">
                        <button 
                            className="px-6 py-3 rounded-xl text-stone-300 font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                            onClick={() => setStep(Math.max(1, step - 1))}
                            disabled={step === 1}
                        >
                            Back
                        </button>
                        
                        <button 
                            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2"
                            onClick={() => {
                                if (step < 4) setStep(step + 1);
                                else router.push('/admin');
                            }}
                        >
                            {step === 4 ? 'Launch Dashboard' : 'Next Step'} <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
