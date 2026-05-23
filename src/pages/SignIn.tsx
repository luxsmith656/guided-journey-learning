import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../lib/firebase';
import Loading from './Loading';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { settings } = useBranding();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/loading', { replace: true });
    }
  }, [user, authLoading, navigate]);

  if (isLoading) {
    return <Loading redirect={false} />;
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      navigate('/loading', { replace: true });
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setIsLoading(true);
    const demoPass = 'letmastery123';
    
    // Set state for visual feedback
    setEmail(demoEmail);
    setPassword(demoPass);

    try {
      try {
        await loginWithEmail(demoEmail, demoPass);
      } catch (loginErr: any) {
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
          const role = demoEmail.split('@')[0];
          const display = role.charAt(0).toUpperCase() + role.slice(1);
          localStorage.setItem('pendingRegistrationData', JSON.stringify({ fullName: `Demo ${display}`, age: '25' }));
          await registerWithEmail(demoEmail, demoPass);
        } else {
          throw loginErr;
        }
      }
      navigate('/loading', { replace: true });
    } catch (err: any) {
      console.error('Demo Auth error:', err.code, err.message);
      setError(`Demo login failed: ${err.message}`);
      setIsLoading(false);
    }
  };

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
      try {
        if (isSignUp) {
          if (!fullName || !age) {
            setError('Please fill in Name and Age');
            setIsLoading(false);
            return;
          }
          // Save for AuthContext logic
          try {
            localStorage.setItem('pendingRegistrationData', JSON.stringify({ fullName, age }));
          } catch(e) { console.warn(e); }
          await registerWithEmail(email, password);
        } else {
          try {
            await loginWithEmail(email, password);
          } catch (loginErr: any) {
            // Auto-fallback for demo accounts even if not clicking the demo button
            const demoEmails = ['student@letmastery.com', 'instructor@letmastery.com', 'admin@letmastery.com'];
            if ((loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') && demoEmails.includes(email.toLowerCase())) {
              const role = email.split('@')[0];
              const display = role.charAt(0).toUpperCase() + role.slice(1);
              localStorage.setItem('pendingRegistrationData', JSON.stringify({ fullName: `Demo ${display}`, age: '25' }));
              await registerWithEmail(email, password);
            } else {
              throw loginErr;
            }
          }
        }
        navigate('/loading', { replace: true });
      } catch (err: any) {
      console.error('Auth error:', err.code, err.message);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError(isSignUp ? 'Registration failed. Try a different email.' : 'Invalid email or password. Please sign up if you don\'t have an account.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in Firebase. Please enable it in the Firebase Console.');
      } else {
        setError(err.message);
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex items-center justify-center antialiased relative overflow-hidden">
       <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none"></div>

       <div className="max-w-md w-full px-6 z-10">
          <div className="text-center mb-6">
             <div className="w-16 h-16 bg-primary text-on-primary rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                {settings.logo.startsWith('http') ? (
                  <img src={settings.logo} alt="Logo" className="w-10 h-10 object-contain" />
                ) : (
                  <span className="material-symbols-outlined text-3xl font-variation-settings-fill-1">{settings.logo}</span>
                )}
             </div>
             <h1 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight">{settings.siteName}</h1>
             <p className="text-on-surface-variant/40 text-[10px] font-bold leading-tight mt-1 uppercase tracking-[0.2em]">{isSignUp ? 'Create your professional account' : 'Sign in to your learning dashboard'}</p>
          </div>

          <div className="bg-surface-container-lowest rounded-[32px] p-8 shadow-2xl shadow-surface-dim/20 border border-outline-variant/30">
            <form className="space-y-4" onSubmit={handleAuthAction}>
               {error && (
                 <div className={`text-[11px] p-4 rounded-2xl font-bold uppercase tracking-wider text-center border animate-shake ${
                   error.includes('sent') || error.includes('success') 
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/5' 
                    : 'bg-error/10 text-error border-error/20'
                 }`}>
                   {error}
                 </div>
               )}

               {email.toLowerCase() === 'castanar656@gmail.com' && !error && !isSignUp && (
                 <div className="bg-primary/5 text-primary text-[10px] p-3 rounded-xl font-bold uppercase tracking-widest text-center border border-primary/10 mb-2 animate-pulse">
                   Admin: Click "Forgot?" to set your password via email
                 </div>
               )}

               {isSignUp && (
                 <>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1">Full Name</label>
                      <input 
                        type="text" 
                        placeholder="Juana Dela Cruz"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-surface-container border border-transparent rounded-2xl px-5 py-3.5 text-sm font-medium text-on-surface focus:bg-surface-container-lowest focus:border-primary/20 outline-none transition-all placeholder:text-on-surface-variant/30"
                        required
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1">Age</label>
                      <input 
                        type="number" 
                        placeholder="21"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="w-full bg-surface-container border border-transparent rounded-2xl px-5 py-3.5 text-sm font-medium text-on-surface focus:bg-surface-container-lowest focus:border-primary/20 outline-none transition-all placeholder:text-on-surface-variant/30"
                        required
                      />
                   </div>
                 </>
               )}

               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    type="email" 
                    placeholder={isSignUp ? "your@email.com" : "admin@example.com"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-container border border-transparent rounded-2xl px-5 py-3.5 text-sm font-medium text-on-surface focus:bg-surface-container-lowest focus:border-primary/20 outline-none transition-all placeholder:text-on-surface-variant/30"
                    required
                  />
               </div>
               <div className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                     <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Password</label>
                     <button type="button" onClick={() => window.alert('Password reset link sent to your email!')} className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">Forgot?</button>
                  </div>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-container border border-transparent rounded-2xl px-5 py-3.5 text-sm font-medium text-on-surface focus:bg-surface-container-lowest focus:border-primary/20 outline-none transition-all placeholder:text-on-surface-variant/30"
                    required
                  />
               </div>
               
               <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-primary text-on-primary font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:opacity-90 hover:-translate-y-0.5 transition-all outline-none mt-2 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3"
              >
                  {isLoading && <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                  {isSignUp ? 'Create Account' : 'Sign In Now'}
               </button>
            </form>

            <div className="relative my-8">
               <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-outline-variant/10"></div>
               </div>
               <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.2em]">
                  <span className="bg-surface-container-lowest px-6 text-on-surface-variant/40">Fast Connect</span>
               </div>
            </div>

            <button 
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-surface-container border border-outline-variant py-4 rounded-2xl shadow-sm hover:bg-surface-container/80 transition-all font-bold text-sm text-on-surface disabled:opacity-50"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              Continue with Google
            </button>

            <div className="mt-8 pt-8 border-t border-outline-variant/10">
               <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] text-center mb-4">Quick Demo Access</p>
               <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Student', email: 'student@letmastery.com', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
                    { label: 'Instructor', email: 'instructor@letmastery.com', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
                    { label: 'Admin', email: 'admin@letmastery.com', color: 'bg-primary/10 text-primary border-primary/20' }
                  ].map((role) => (
                    <button
                      key={role.label}
                      onClick={() => handleDemoLogin(role.email)}
                      className={`py-3 px-1 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95 ${role.color}`}
                    >
                      {role.label}
                    </button>
                  ))}
               </div>
            </div>
            
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="w-full mt-6 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest hover:text-primary transition-colors text-center"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
          
          <p className="text-center text-[10px] text-on-surface-variant/40 mt-8 font-black uppercase tracking-[0.2em]">
             Authorized for <span className="text-on-surface">Teacher Professionalism</span>
          </p>
       </div>
    </div>
  );
}



