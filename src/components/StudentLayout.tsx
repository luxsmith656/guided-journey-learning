import React, { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Library, 
  BookOpen, 
  CheckSquare, 
  BarChart, 
  LogOut, 
  Settings, 
  Bell, 
  Search,
  Target
} from 'lucide-react';
import HelpSupportButton from './HelpSupportButton';
import { useNotifications } from '../hooks/useNotifications';

export default function StudentLayout({ children, title }: { children: ReactNode, title?: string }) {
  const { user, signOut } = useAuth();
  const { settings } = useBranding();
  const { theme, toggleTheme } = useTheme();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = () => {
    signOut();
    navigate('/sign-in');
  };

  const navItems = [
    { name: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { name: 'My Courses', path: '/student/courses', icon: Library },
    { name: 'To Do', path: '/student/todo', icon: CheckSquare },
    { name: 'Flashcards', path: '/flashcards', icon: BookOpen },
    { name: 'Assessments', path: '/exam?type=mock', icon: Target },
    { name: 'Performance', path: '/quiz-results', icon: BarChart },
  ];

  const renderLogo = () => {
    if (settings.logo.startsWith('http') || settings.logo.startsWith('data:')) {
      return <img src={settings.logo} alt="Logo" className="w-8 h-8 object-contain" />;
    }
    return <span className="material-symbols-outlined text-primary text-[24px]">{settings.logo || 'school'}</span>;
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen antialiased flex flex-col md:flex-row transition-colors duration-300">
      
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 bg-surface-container-lowest border-r border-outline-variant flex-col sticky top-0 h-screen shadow-sm z-40">
        <div className="p-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {renderLogo()}
             </div>
             <h1 className="text-primary text-xl font-extrabold font-headline tracking-tight leading-none truncate">{settings.siteName}</h1>
          </div>
          <p className="text-on-surface-variant/40 text-[10px] font-bold uppercase tracking-widest mt-2">{user?.learningMode === 'class_based' ? 'Classroom Mode' : 'Self-Paced Learning'}</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button 
                key={item.name}
                onClick={() => navigate(item.path)} 
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
              >
                <item.icon size={18} />
                {item.name}
              </button>
            )
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-outline-variant">
          <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl mb-3 border border-outline-variant">
             <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-on-primary font-bold text-sm uppercase shrink-0">
                {user?.email?.[0] || 'U'}
             </div>
             <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs font-bold text-on-surface truncate">{user?.fullName || user?.email}</p>
                <p className="text-[10px] text-on-surface-variant/60 font-medium truncate lowercase">{user?.email}</p>
             </div>
          </div>
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-error font-bold hover:bg-error/5 transition-colors text-sm"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="px-6 py-4 flex items-center justify-between bg-surface-container-lowest md:bg-surface/80 md:backdrop-blur-md border-b border-outline-variant sticky top-0 z-30">
          <div className="md:hidden flex items-center gap-2">
             {renderLogo()}
             <h1 className="text-primary text-xl font-extrabold font-headline tracking-tighter truncate max-w-[200px]">{settings.siteName}</h1>
          </div>
          <div className="hidden md:flex items-center flex-1 ml-4 justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold font-headline text-on-surface tracking-tight">{title || 'Dashboard'}</h2>
            </div>
            <div className="flex items-center bg-surface-container rounded-full px-4 py-2 w-80 shadow-inner border border-outline-variant/30">
               <Search size={16} className="text-on-surface-variant/60 mr-2" />
               <input type="text" placeholder="Search courses, modules, lessons..." className="bg-transparent border-none outline-none text-xs w-full text-on-surface font-medium placeholder:text-on-surface-variant/40" />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button 
              onClick={toggleTheme}
              className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors w-10 h-10 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[20px]">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
            </button>
            <button onClick={() => navigate('/notifications')} className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors relative">
               {unreadCount > 0 && (
                 <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-error rounded-full text-[9px] leading-4 text-white font-black pointer-events-none text-center">
                   {unreadCount > 9 ? '9+' : unreadCount}
                 </span>
               )}
               <Bell size={20} />
            </button>
            <button onClick={() => navigate('/profile')} className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors hidden md:block">
              <Settings size={20} />
            </button>
            <button 
              onClick={handleSignOut}
              className="p-2 text-on-surface-variant md:hidden"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="p-4 md:p-8 w-full max-w-7xl mx-auto space-y-8 flex-1">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface-container-lowest border-t border-outline-variant flex justify-around p-3 z-50 shadow-lg">
        {navItems.slice(0, 4).map(item => {
           const isActive = location.pathname.startsWith(item.path);
           return (
              <button key={item.name} onClick={() => navigate(item.path)} className={`flex flex-col items-center gap-1 ${isActive ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                <item.icon size={20} />
                <span className="text-[10px] font-bold tracking-tight">{item.name}</span>
              </button>
           )
        })}
      </nav>
      <HelpSupportButton />
    </div>
  );
}
