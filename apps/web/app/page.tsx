import { HeroSection } from "@/components/landing/HeroSection";
import { StatsBar } from "@/components/landing/StatsBar";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PricingSection } from "@/components/landing/PricingSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Global mesh gradient background */}
      <div className="fixed inset-0 bg-gradient-mesh pointer-events-none" aria-hidden />
      {/* Animated orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/20 blur-[120px] animate-pulse-slow pointer-events-none" aria-hidden />
      <div className="fixed top-[30%] right-[-15%] w-[500px] h-[500px] rounded-full bg-accent-purple/15 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: "2s" }} aria-hidden />
      <div className="fixed bottom-[-10%] left-[30%] w-[400px] h-[400px] rounded-full bg-accent-cyan/10 blur-[120px] animate-pulse-slow pointer-events-none" style={{ animationDelay: "4s" }} aria-hidden />

      <Navbar />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />
      <PricingSection />
      <TestimonialsSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
