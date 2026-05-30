import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { seedPublicCurriculum } from '../lib/db-seed';
import { useNotifications } from '../hooks/useNotifications';

interface TopbarProps {
  title?: string;
}

import { useTheme } from '../context/ThemeContext';

export default function Topbar({ title = 'LET Mastery' }: TopbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { unreadItems, unreadCount } = useNotifications();
  const { toggle } = useSidebar();
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate('/sign-in');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await seedPublicCurriculum();
      alert('Cloud Sync Successful: public curriculum, questions, modules, textbooks, and blueprints have been updated.');
    } catch (err: any) {
      alert('Sync Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="flex justify-between items-center w-full px-6 py-3 bg-surface/80 backdrop-blur-md text-on-surface font-headline text-sm tracking-tight sticky top-0 z-40 border-b border-outline-variant">
      {/* Mobile Menu Toggle & Brand */}
      <div className="flex items-center gap-4">
        <button 
          onClick={toggle}
          className="md:hidden text-on-surface-variant p-2 rounded-full hover:bg-surface-container transition-colors focus:outline-none"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="text-xl font-extrabold tracking-tighter text-primary md:hidden">
          {title}
        </div>
        {/* Search Bar */}
        <div className="hidden sm:flex items-center bg-surface-container rounded-xl px-4 py-2 border border-outline-variant transition-all min-w-[280px] focus-within:ring-2 focus-within:ring-primary/10">
          <span className="material-symbols-outlined text-on-surface-variant/50 mr-2">search</span>
          <input className="bg-transparent border-none outline-none text-sm w-full font-body text-on-surface placeholder:text-on-surface-variant/40 focus:ring-0" placeholder="Search resources..." type="text" />
        </div>
      </div>

      {/* Trailing Actions */}
      <div className="flex items-center gap-2 relative">
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors duration-200 w-10 h-10 flex items-center justify-center"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span className="material-symbols-outlined">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
        </button>

        <button 
          onClick={() => {
            setNotificationsOpen(!notificationsOpen);
            setProfileOpen(false);
          }}
          className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors duration-200 relative w-10 h-10 flex items-center justify-center"
        >
          <span className="material-symbols-outlined">notifications</span>
          {unreadCount > 0 && <span className="absolute top-2 right-2 min-w-4 h-4 px-1 bg-error rounded-full border-2 border-surface text-[9px] leading-3 text-white font-black">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>

        {notificationsOpen && (
          <div className="absolute top-12 right-0 w-80 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant py-2 z-50 transition-all">
            <div className="px-4 py-2 border-b border-outline-variant/10 font-bold text-on-surface flex justify-between items-center text-sm">
              <span>Notifications</span>
              <Link to="/notifications" className="text-[10px] text-primary font-bold uppercase tracking-widest hover:underline">View All</Link>
            </div>
            <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
              {unreadItems.length === 0 ? (
                <p className="text-xs text-on-surface-variant/40 px-3 py-2">No new notifications</p>
              ) : (
                unreadItems.slice(0, 5).map(report => (
                  <Link to={report.targetLink || '/notifications'} key={report.id} className="block px-3 py-2 hover:bg-surface-container rounded-xl transition-colors cursor-pointer">
                    <p className="text-xs font-bold text-on-surface truncate">{report.title || report.subject}</p>
                    <p className="text-[10px] text-on-surface-variant/40 font-medium">{report.body || report.description}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        {user?.role === 'admin' && (
          <button 
            disabled={syncing}
            onClick={handleSync}
            className={`p-2 rounded-full transition-colors duration-200 w-10 h-10 flex items-center justify-center ${syncing ? 'text-primary animate-spin' : 'text-on-surface-variant/40 hover:bg-surface-container'}`}
            title="Manual Cloud Sync (Seed Presets)"
          >
            <span className="material-symbols-outlined">{syncing ? 'sync' : 'cloud_sync'}</span>
          </button>
        )}

        <ExtractedProfileMenu 
          open={profileOpen} 
          setOpen={setProfileOpen} 
          setNotificationsOpen={setNotificationsOpen} 
          onSignOut={handleSignOut}
          userEmail={user?.email}
        />
      </div>
    </header>
  );
}

interface ProfileMenuProps {
  open: boolean;
  setOpen: (o: boolean) => void;
  setNotificationsOpen: (o: boolean) => void;
  onSignOut: () => void;
  userEmail?: string;
}

function ExtractedProfileMenu({ open, setOpen, setNotificationsOpen, onSignOut, userEmail }: ProfileMenuProps) {
  return (
    <>
      <button 
        onClick={() => {
          setOpen(!open);
          setNotificationsOpen(false);
        }}
        className="w-10 h-10 rounded-xl ml-1 overflow-hidden border border-outline-variant shadow-sm transition-transform active:scale-95 bg-surface-container"
      >
        <img alt="Administrator Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDAwKbH0aIL4IWnrRmSgvV-T1zY-iZ9g3vvSayMrf3zKTRs2YDu90bNYCDqmRDIy1V7MxxknH8iEIKZnSqc-wpPtp7GklcEQAILGB2QGCgPgaBUB09Vr2o3NNPXL_ShgIzMof2IhZ-kVrOvQexTScDa7zCL3rqT_jrt71OefgsN6lsoFFL0kDmshpoIP4bXcAJqTkHIt8O6XV6NQVqe9p728CqyBa9JjtU-Es_amvnc2dHadh1pim0Xon2o5DDEPOzgjFCJua_mKw" />
      </button>

      {open && (
        <div className="absolute top-12 right-0 w-64 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant py-2 z-50 transition-all">
          <div className="px-4 py-3 border-b border-outline-variant/10 mb-1">
            <p className="font-bold text-on-surface truncate text-sm">Administrator</p>
            <p className="text-[10px] text-on-surface-variant/60 truncate font-medium lowercase">{userEmail || 'admin@portal.edu'}</p>
          </div>
          <Link to="/settings" className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container transition-colors text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            <span className="material-symbols-outlined text-[18px]">account_circle</span>
            Profile
          </Link>
          <div className="h-px bg-outline-variant/10 my-1"></div>
          <button 
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-error/5 transition-colors text-xs font-bold text-error uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Sign out
          </button>
        </div>
      )}
    </>
  );
}
