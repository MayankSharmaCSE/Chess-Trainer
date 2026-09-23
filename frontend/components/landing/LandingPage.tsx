import Navbar from "./Navbar";
import Hero from "./Hero";
import HowItWorks from "./HowItWorks";
import FilmBand from "./FilmBand";
import WeaknessMap from "./WeaknessMap";
import Evidence from "./Evidence";
import Progress from "./Progress";
import Features from "./Features";
import Faq from "./Faq";
import { FinalCta, Footer } from "./Closing";

export default function LandingPage() {
  return (
    <div className="landing min-h-screen bg-[#F2F4F6] font-body text-[#13233A] antialiased">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <Navbar />
      <main id="main">
        <Hero />
        <HowItWorks />
        <FilmBand />
        <WeaknessMap />
        <Evidence />
        <Progress />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
