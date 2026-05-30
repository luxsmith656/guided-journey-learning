import React, { ReactNode, useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useSidebar } from '../context/SidebarContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { seedPublicCurriculum } from '../lib/db-seed';
import HelpSupportButton from './HelpSupportButton';

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { isCollapsed } = useSidebar();
  const [isSeeding, setIsSeeding] = useState(false);
  const seedingRef = React.useRef(false);
  const seedCountsRef = React.useRef({ categories: 0, modules: 0, textbooks: 0 });

  useEffect(() => {
    const maybeSeed = () => {
      const counts = seedCountsRef.current;
      if ((counts.categories < 3 || counts.modules < 3 || counts.textbooks < 3) && !seedingRef.current) {
        seedingRef.current = true;
        setIsSeeding(true);
        console.log('Admin Platform: Data missing or incomplete. Initializing preset journey data...');
        seedPublicCurriculum()
          .then(() => console.log('System initialized with preset curriculum, modules, textbooks, and questions.'))
          .catch(err => {
            console.error('Admin Platform: Initialization failed:', err);
          })
          .finally(() => {
            setIsSeeding(false);
            // Don't reset seedingRef so we don't loop if it fails
          });
      }
    };

    // Shared auto-seed logic for any admin page if the platform is empty or incomplete
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      seedCountsRef.current.categories = snapshot.size;
      maybeSeed();
    });
    const unsubModules = onSnapshot(collection(db, 'modules'), (snapshot) => {
      seedCountsRef.current.modules = snapshot.size;
      maybeSeed();
    });
    const unsubTextbooks = onSnapshot(collection(db, 'textbooks'), (snapshot) => {
      seedCountsRef.current.textbooks = snapshot.size;
      maybeSeed();
    });

    return () => {
      unsubCategories();
      unsubModules();
      unsubTextbooks();
    };
  }, []);

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex antialiased transition-colors duration-300">
      <Sidebar />
      <main className={`flex-1 flex flex-col relative min-h-screen transition-all duration-300 ${isCollapsed ? 'md:ml-[80px]' : 'md:ml-[280px]'}`}>
        
        {isSeeding && (
          <div className="bg-primary text-on-primary text-[10px] font-bold uppercase tracking-[0.2em] py-1 text-center animate-pulse z-50">
            System Initializing: Seeding Preset Curriculum, Modules, Textbooks & Questions...
          </div>
        )}
        
        <Topbar title={title} />
        {children}
        <HelpSupportButton />
      </main>
    </div>
  );
}
