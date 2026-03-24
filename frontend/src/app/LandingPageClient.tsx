'use client';

import Link from 'next/link';
import { 
  QrCode, 
  MessageSquare, 
  Mic, 
  ShieldCheck, 
  BarChart3, 
  ArrowRight, 
  CheckCircle2,
  Coffee,
  Zap,
  LayoutDashboard
} from 'lucide-react';

export default function LandingPageClient() {
  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg text-light-text dark:text-dark-text overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-md border-b border-light-border dark:border-dark-border">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
              <QrCode className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight">QRistretto</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 font-medium">
            <a href="#features" className="hover:text-accent transition-colors">Features</a>
            <a href="#pricing" className="hover:text-accent transition-colors">Pricing</a>
            <Link href="/admin" className="hover:text-accent transition-colors">Partner Login</Link>
            <Link href="/signup" className="btn-primary py-2.5 px-6 rounded-full shadow-lg shadow-accent/20">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent font-semibold text-sm mb-8 animate-fade-in">
            <Zap className="w-4 h-4" />
            <span>The Future of Dining is Here</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-8 tracking-tight animate-slide-up">
            Digital Transformation for <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-hover">Modern Cafés & Restaurants</span>
          </h1>
          
          <p className="text-xl text-light-muted dark:text-dark-muted max-w-2xl mx-auto mb-12 animate-slide-up animation-delay-100">
            Automate your orders, leverage WhatsApp AI, and gain deep insights into your business. QRistretto is the all-in-one SaaS for the hospitality world.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up animation-delay-200">
            <Link href="/signup" className="btn-primary px-8 py-4 rounded-full text-lg font-bold flex items-center gap-2 group w-full sm:w-auto">
              Start Free Trial <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/super-admin/login" className="btn-secondary px-8 py-4 rounded-full text-lg font-bold w-full sm:w-auto">
              Live Demo
            </Link>
          </div>

          {/* Floated Mockup Hint */}
          <div className="mt-20 relative max-w-5xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-light-border dark:border-dark-border animate-fade-in animation-delay-300">
             <div className="bg-light-bg dark:bg-dark-card p-4 flex items-center gap-2 border-b border-light-border dark:border-dark-border text-xs text-light-muted">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                <span className="ml-2 font-medium">Dashboard — QRistretto SaaS Platform</span>
             </div>
             <div className="aspect-video bg-white dark:bg-dark-bg flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 grid grid-cols-12 gap-4 p-8 opacity-20">
                   <div className="col-span-3 bg-accent/20 rounded-xl"></div>
                   <div className="col-span-9 space-y-4">
                      <div className="h-12 bg-accent/20 rounded-xl w-3/4"></div>
                      <div className="grid grid-cols-3 gap-4">
                         <div className="h-32 bg-accent/20 rounded-xl"></div>
                         <div className="h-32 bg-accent/20 rounded-xl"></div>
                         <div className="h-32 bg-accent/20 rounded-xl"></div>
                      </div>
                      <div className="h-64 bg-accent/20 rounded-xl"></div>
                   </div>
                </div>
                <Coffee className="w-24 h-24 text-accent/50 animate-pulse" />
             </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-light-bg dark:bg-dark-card/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything you need to scale</h2>
            <p className="text-light-muted dark:text-dark-muted text-lg">Powerful tools built for high-performance establishments.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<MessageSquare className="text-accent" />}
              title="WhatsApp Ordering"
              description="Customers place orders directly via WhatsApp. No apps to download, no friction."
            />
            <FeatureCard 
              icon={<Mic className="text-accent" />}
              title="AI Voice Processor"
              description="Transcribe and process voice notes automatically into structured orders."
            />
            <FeatureCard 
              icon={<ShieldCheck className="text-accent" />}
              title="Multi-Tenant Security"
              description="Top-tier data isolation ensuring your business data is always private and secure."
            />
            <FeatureCard 
              icon={<LayoutDashboard className="text-accent" />}
              title="Real-time Kitchen"
              description="Manage orders as they come in with zero delay and sound notifications."
            />
            <FeatureCard 
              icon={<BarChart3 className="text-accent" />}
              title="Advanced Analytics"
              description="Track top items, peak hours, and staff performance from your dashboard."
            />
            <FeatureCard 
              icon={<Zap className="text-accent" />}
              title="Instant QR Menus"
              description="Generate beautiful, localized QR codes for your tables in seconds."
            />
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
           <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Plans</h2>
            <p className="text-light-muted dark:text-dark-muted text-lg">Choose the perfect tier for your business growth.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
             <PricingCard 
                name="Starter"
                price="149"
                features={['150 Orders/Day', '3 Staff Accounts', 'Digital Menu', 'Basic Analytics']}
             />
             <PricingCard 
                name="Pro"
                price="399"
                isPopular
                features={['Everything in Starter', 'WhatsApp AI Bot', 'Voice Ordering', 'Unlimited Orders']}
             />
             <PricingCard 
                name="Enterprise"
                price="899"
                features={['Everything in Pro', 'Multi-location Management', 'PDF Reports', 'Priority Support']}
             />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-light-border dark:border-dark-border">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <QrCode className="text-accent w-6 h-6" />
            <span className="text-xl font-bold">QRistretto</span>
          </div>
          <div className="text-light-muted dark:text-dark-muted text-sm">
            © 2026 QRistretto SaaS. All rights reserved.
          </div>
          <div className="flex gap-6">
             <Link href="/signup" className="hover:text-accent font-medium">Create Account</Link>
             <Link href="/super-admin/login" className="hover:text-accent font-medium">Administrator</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-3xl bg-white dark:bg-dark-card border border-light-border dark:border-dark-border hover:border-accent/50 transition-colors group">
      <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-light-muted dark:text-dark-muted leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function PricingCard({ name, price, features, isPopular }: { name: string, price: string, features: string[], isPopular?: boolean }) {
  return (
    <div className={`p-8 rounded-3xl bg-white dark:bg-dark-card border-2 flex flex-col ${isPopular ? 'border-accent shadow-xl shadow-accent/10 scale-105' : 'border-light-border dark:border-dark-border'}`}>
      {isPopular && (
        <span className="bg-accent text-white text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-full self-start mb-4">
          Most Popular
        </span>
      )}
      <h3 className="text-2xl font-bold mb-2">{name}</h3>
      <div className="flex items-baseline gap-1 mb-8">
        <span className="text-4xl font-extrabold">{price}</span>
        <span className="text-light-muted font-medium">MAD/mo</span>
      </div>
      <div className="space-y-4 mb-10 flex-grow">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
            <span className="font-medium">{f}</span>
          </div>
        ))}
      </div>
      <Link href="/signup" className={`w-full py-4 rounded-full font-bold text-center transition-all ${isPopular ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-light-bg dark:bg-dark-bg hover:bg-light-border dark:hover:bg-dark-border'}`}>
        Choose Plan
      </Link>
    </div>
  );
}
