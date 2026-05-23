import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Loading({ redirect = true }: { redirect?: boolean }) {
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            if (!redirect) return;
            if (isLoading) return;
            if (!user) {
              navigate('/sign-in', { replace: true });
              return;
            }
            if (user.role === 'admin') navigate('/admin/dashboard', { replace: true });
            else if (user.role === 'instructor') navigate('/instructor/dashboard', { replace: true });
            else if (!user.onboarded) navigate('/onboarding', { replace: true });
            else if (!user.diagnosticCompleted) navigate('/diagnostic', { replace: true });
            else navigate('/student/dashboard', { replace: true });
          }, 500);
          return 100;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [navigate, user, isLoading, redirect]);

  return (
    <div className="bg-primary text-on-primary font-body min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden antialiased">
       {/* Background decorative elements */}
       <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary-container rounded-full blur-[100px] opacity-60"></div>
       <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-secondary-container/30 rounded-full blur-[100px] opacity-60"></div>
       
       <div className="z-10 flex flex-col items-center max-w-sm w-full px-8 text-center">
          <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl mb-8 flex items-center justify-center border border-white/20 shadow-2xl">
             <span className="text-4xl font-black font-headline tracking-tighter">L</span>
          </div>
          <h1 className="text-3xl font-extrabold font-headline mb-2 tracking-tight">LET Mastery</h1>
          <p className="text-primary-fixed-dim text-sm font-medium mb-12">Preparing your study environment...</p>
          
          <div className="w-full max-w-[200px] space-y-3">
            <div className="w-full bg-primary-container/50 h-1.5 rounded-full overflow-hidden backdrop-blur-sm">
               <div 
                 className="h-full bg-secondary-fixed transition-all duration-300 ease-out rounded-full"
                 style={{ width: `${progress}%` }}
               ></div>
            </div>
            <div className="text-xs font-bold text-secondary-fixed-dim text-right tracking-widest">{progress}%</div>
          </div>
       </div>
    </div>
  );
}
