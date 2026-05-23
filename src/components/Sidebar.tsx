import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { useBranding } from '../context/BrandingContext';

export default function Sidebar() {
  const location = useLocation();
  const { isOpen, toggle, isCollapsed, toggleCollapse } = useSidebar();
  const { settings } = useBranding();

  const navItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    { name: 'Modules', path: '/admin/modules', icon: 'view_timeline' },
    { name: 'Classes', path: '/admin/classes', icon: 'groups' },
    { name: 'Analytics', path: '/admin/analytics', icon: 'bar_chart' },
    { name: 'Users', path: '/admin/users', icon: 'group' },
    { name: 'Settings', path: '/admin/settings', icon: 'settings' },
  ];

  const renderLogo = () => {
    if (settings.logo.startsWith('http') || settings.logo.startsWith('data:')) {
      return <img src={settings.logo} alt="Logo" className="w-8 h-8 object-contain" />;
    }
    return <span className="material-symbols-outlined text-[24px]">{settings.logo || 'school'}</span>;
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-[60] md:hidden"
          onClick={toggle}
        ></div>
      )}

      {/* Sidebar Container */}
      <nav className={`
        fixed left-0 top-0 h-screen bg-surface-container-lowest text-on-surface font-body text-sm border-r border-outline-variant z-[70] transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'w-[80px]' : 'w-[280px]'}
      `}>
        {/* Header / Brand */}
        <div className={`px-6 mt-8 mb-10 flex items-center transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'gap-3'}`}>
          <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
            {renderLogo()}
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="font-extrabold text-primary text-[18px] tracking-tight leading-tight truncate">{settings.siteName}</div>
              <div className="text-[10px] text-on-surface-variant/40 font-bold font-body mt-0.5 truncate uppercase tracking-widest">Admin Control</div>
            </div>
          )}
          
          {/* Mobile Close Button */}
          <button 
            onClick={toggle}
            className="md:hidden ml-auto p-2 text-on-surface-variant hover:bg-surface-container rounded-full"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Navigation Items */}
        <div className={`flex-1 overflow-y-auto space-y-2 ${isCollapsed ? 'px-2' : 'px-4'}`}>
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => { if (isOpen) toggle(); }}
                className={`py-3.5 flex items-center transition-all duration-200 rounded-2xl ${
                  isCollapsed ? 'justify-center px-0' : 'px-4 gap-4'
                } ${
                  isActive 
                    ? 'bg-primary/10 text-primary font-bold shadow-sm' 
                    : 'text-on-surface-variant font-medium hover:bg-surface-container hover:text-on-surface'
                }`}
                title={isCollapsed ? item.name : ''}
              >
                <span 
                  className="material-symbols-outlined text-[20px]" 
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
                {!isCollapsed && <span className="text-[14px] tracking-tight">{item.name}</span>}
              </Link>
            );
          })}
        </div>

        {/* Bottom Actions & Collapse Toggle */}
        <div className={`mt-auto pb-8 ${isCollapsed ? 'px-2' : 'px-4'} space-y-4`}>
          <button className={`w-full flex items-center bg-primary text-on-primary rounded-full font-bold transition-all hover:opacity-90 hover:shadow-lg focus:outline-none ${
            isCollapsed ? 'justify-center p-3' : 'justify-center gap-2 px-4 py-3'
          }`}>
            <span className="material-symbols-outlined text-sm">download</span>
            {!isCollapsed && <span className="text-xs">Export Reports</span>}
          </button>

          {/* Desktop Collapse Toggle */}
          <button 
            onClick={toggleCollapse}
            className="hidden md:flex w-full items-center justify-center p-3 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-2xl transition-all"
          >
            <span className={`material-symbols-outlined transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}>
              keyboard_double_arrow_left
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

