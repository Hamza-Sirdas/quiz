import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeaturesSection } from '@/components/home/FeaturesSection';
import { Footer } from '@/components/home/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { Navbar, type HomeSectionId } from '@/components/home/Navbar';

export function HomePage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<HomeSectionId>('ana-sayfa');

  return (
    <div className="min-h-dvh flex flex-col bg-cream-100 text-navy-900 overflow-x-clip">
      <Navbar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
      />

      <main className="flex-1">
        <HeroSection
          onJoinGame={() => navigate('/join')}
          onCreateQuiz={() => navigate('/dashboard/quizzes/new')}
        />
        <FeaturesSection />
      </main>

      <Footer onSelectSection={setActiveSection} />
    </div>
  );
}
